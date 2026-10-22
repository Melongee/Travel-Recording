package local.travel;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.stereotype.Component;

/** Coordinates the short database replacement with API requests and the scan worker. */
@Component
public class LibraryMaintenance {
    private final ReentrantReadWriteLock gate = new ReentrantReadWriteLock(true);
    public Lease read() {
        try {
            if (!gate.readLock().tryLock(2, TimeUnit.SECONDS)) throw new Busy("图库正在恢复，请稍后重试");
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new Busy("操作已中断"); }
        return gate.readLock()::unlock;
    }
    public Lease exclusive() {
        if (!gate.writeLock().tryLock()) throw new Busy("图库正在扫描或处理其他请求，请稍后再恢复");
        return gate.writeLock()::unlock;
    }
    public interface Lease extends AutoCloseable { @Override void close(); }
    public static class Busy extends RuntimeException { Busy(String message) { super(message); } }
}
