import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { EMAIL_PROVIDER } from './providers/email-provider';
import { LocalEmailProvider } from './providers/local-email.provider';

// Global so TokenService (needed by AuthGuard, which other feature modules reference
// directly via `@UseGuards(AuthGuard)` without importing AuthModule themselves) resolves
// from any module's injector context — matching this codebase's existing convention of
// marking foundational cross-cutting modules Global (ConfigModule, PrismaModule, AuditModule).
// Rate limiting: the 'auth' named throttler bucket this module's `@UseGuards(ThrottlerGuard)`
// routes use is registered centrally in ../rate-limit/rate-limit.module.ts, not here --
// see that file for why a module-local `ThrottlerModule.forRootAsync()` call is unsafe.
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    EmailVerificationService,
    PasswordResetService,
    // Mock/local adapter (CLAUDE.md §3: adapter-based, mock by default). Swap this binding
    // for a real EmailProvider implementation once a provider is approved.
    { provide: EMAIL_PROVIDER, useClass: LocalEmailProvider },
  ],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
