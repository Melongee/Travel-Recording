package local.travel;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DesktopIdentityTest {
    @TempDir(factory=ProjectTempDirFactory.class) Path fixtures;
    @Test void challengeAndCanonicalLibraryLock() throws Exception {
        AppPaths paths=new AppPaths(fixtures.resolve("中文 library").toString());
        var identity=new DesktopIdentity("private-token",paths);
        assertEquals(404,identity.identity("").getStatusCode().value());
        assertEquals(404,identity.identity("wrong").getStatusCode().value());
        assertEquals(200,identity.identity("private-token").getStatusCode().value());
        assertEquals(404,new DesktopIdentity("",paths).identity("").getStatusCode().value());
        try(var first=new LibraryDatabase(paths)) {
            assertThrows(IllegalStateException.class,()->new LibraryDatabase(new AppPaths(paths.data.resolve(".").toString())));
        }
        try(var reopened=new LibraryDatabase(paths);var connection=reopened.getConnection()) { assertFalse(connection.isClosed()); }
    }
}
