package local.travel;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@MapperScan("local.travel.mapper")
public class TravelApplication {
    public static void main(String[] args) { SpringApplication.run(TravelApplication.class, args); }
}
