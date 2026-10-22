package local.travel;

import java.io.IOException;
import java.nio.file.*;
import java.nio.channels.*;
import java.sql.*;
import java.util.UUID;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import com.zaxxer.hikari.*;

/** Stable DataSource reference: MyBatis/JdbcTemplate remain valid after an empty-library restore. */
public class LibraryDatabase extends AbstractDataSource implements AutoCloseable {
    private final AppPaths paths;
    private volatile HikariDataSource pool;
    private final FileChannel lockChannel;
    private final FileLock dataLock;
    LibraryDatabase(AppPaths paths) {
        this.paths=paths;
        FileChannel channel=null; FileLock lock=null;
        try {
            channel=FileChannel.open(paths.data.resolve("application.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);
            lock=channel.tryLock();
            if(lock==null)throw new IOException("数据目录已被另一个旅迹服务使用");
            lockChannel=channel;dataLock=lock;pool=openPool();
        } catch(Exception e) {
            try{if(lock!=null)lock.release();if(channel!=null)channel.close();}catch(IOException ignored){}
            throw new IllegalStateException("无法独占应用数据目录，请先停止旧服务或使用独立数据目录",e);
        }
    }
    private HikariDataSource openPool() {
        SQLiteConfig sqlite=new SQLiteConfig();
        sqlite.enforceForeignKeys(true); sqlite.setBusyTimeout(5000); sqlite.setJournalMode(SQLiteConfig.JournalMode.WAL);
        SQLiteDataSource source=new SQLiteDataSource(sqlite);
        source.setUrl("jdbc:sqlite:"+paths.data.resolve("library.db"));
        HikariConfig config=new HikariConfig(); config.setDataSource(source); config.setMaximumPoolSize(1); config.setPoolName("library");
        return new HikariDataSource(config);
    }
    @Override public Connection getConnection() throws SQLException { return pool.getConnection(); }
    @Override public Connection getConnection(String user,String password) throws SQLException { return getConnection(); }
    public void snapshot(Path destination) throws SQLException {
        try (Connection c=getConnection(); PreparedStatement s=c.prepareStatement("VACUUM INTO ?")) {
            s.setString(1,destination.toString()); s.execute();
        }
    }
    @FunctionalInterface interface Check { void verify(Connection c) throws SQLException; }
    // Caller holds LibraryMaintenance.exclusive(); no request or scan may retain a connection here.
    synchronized void replace(Path candidate, Check check) throws IOException, SQLException {
        Path original=paths.data.resolve("library.db");
        Path recovery=Files.createDirectories(paths.data.resolve("backups")).resolve("before-restore-"+UUID.randomUUID()+".db");
        snapshot(recovery);
        try (Connection c=getConnection(); Statement s=c.createStatement(); ResultSet r=s.executeQuery("PRAGMA wal_checkpoint(TRUNCATE)")) {
            if (r.next() && r.getInt(1)!=0) throw new SQLException("数据库仍被占用，未执行恢复");
        }
        pool.close();
        try {
            atomicReplace(candidate,original);
            pool=openPool();
            try (Connection c=getConnection()) { check.verify(c); }
        } catch (Exception failed) {
            pool.close();
            try {
                // Preserve the recovery snapshot even if a subsequent open fails.
                Path rollback=paths.data.resolve("rollback-"+UUID.randomUUID()+".db");
                Files.copy(recovery,rollback); atomicReplace(rollback,original); pool=openPool();
            } catch (Exception rollbackFailed) { failed.addSuppressed(rollbackFailed); }
            throw new IOException("恢复失败，已尝试回退；恢复前快照保留于 "+recovery,failed);
        }
    }
    static void atomicReplace(Path source,Path target) throws IOException {
        try { Files.move(source,target,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING); }
        catch (AtomicMoveNotSupportedException e) { Files.move(source,target,StandardCopyOption.REPLACE_EXISTING); }
    }
    @Override public void close() {
        pool.close();
        try { dataLock.release();lockChannel.close(); } catch(IOException e) { throw new IllegalStateException(e); }
    }
}
