package local.travel;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication
@MapperScan("local.travel.mapper")
public class TravelApplication {
    public static void main(String[] args) {
        // Only the desktop child watches this private inherited pipe. EOF also covers a crashed shell.
        boolean desktop = System.getenv("TRAVEL_DESKTOP_TOKEN") != null;
        AtomicBoolean ended = new AtomicBoolean();
        AtomicReference<ConfigurableApplicationContext> running = new AtomicReference<>();
        Runnable shutdown = () -> {
            ended.set(true);
            var context = running.getAndSet(null);
            if (context != null) { context.close(); System.exit(0); }
        };
        if (desktop) Thread.ofPlatform().daemon().name("desktop-parent-pipe").start(() -> {
            try (var input = new BufferedReader(new InputStreamReader(System.in))) {
                while (true) { String line=input.readLine(); if (line==null || line.equals("shutdown")) break; }
            } catch (java.io.IOException ignored) { }
            shutdown.run();
        });
        var context = SpringApplication.run(TravelApplication.class, args);
        if (desktop) {
            running.set(context);
            if (ended.get()) shutdown.run();
            else System.out.println("TRAVEL_DESKTOP_READY="+((WebServerApplicationContext)context).getWebServer().getPort());
        }
    }
}
