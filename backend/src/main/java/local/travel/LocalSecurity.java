package local.travel;

import java.io.IOException;
import java.net.URI;
import java.util.Set;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class LocalSecurity {
    @Bean UserDetailsService noAccounts() { return new InMemoryUserDetailsManager(); }
    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        var handler = new CsrfTokenRequestAttributeHandler();
        http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .csrf(csrf -> csrf.csrfTokenRepository(new HttpSessionCsrfTokenRepository()).csrfTokenRequestHandler(handler))
            .headers(headers -> headers.contentSecurityPolicy(csp -> csp.policyDirectives(
                "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'")))
            .addFilterBefore(new LocalRequestFilter(), CsrfFilter.class);
        return http.build();
    }
    static class LocalRequestFilter extends OncePerRequestFilter {
        private static final Set<String> HOSTS = Set.of("127.0.0.1", "localhost", "[::1]", "::1");
        @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
            boolean valid = HOSTS.contains(req.getServerName());
            String origin = req.getHeader("Origin");
            if (origin != null) {
                try {
                    URI uri = URI.create(origin);
                    int port = uri.getPort() < 0 ? 80 : uri.getPort();
                    valid &= "http".equals(uri.getScheme()) && HOSTS.contains(uri.getHost()) && port == req.getLocalPort();
                } catch (IllegalArgumentException e) { valid = false; }
            }
            if ("cross-site".equals(req.getHeader("Sec-Fetch-Site"))) valid = false;
            if (!valid) { res.sendError(403, "仅允许本机同源访问"); return; }
            chain.doFilter(req, res);
        }
    }
}
