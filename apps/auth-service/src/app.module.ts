import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { UserRepository } from './user.repository';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [UserRepository, AuthService, MailService],
})
export class AppModule {}
