import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthService } from './auth.service';

class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsIn(['CUSTOMER', 'DRIVER'])
  userType: 'CUSTOMER' | 'DRIVER';
}

class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  otp: string;

  @IsIn(['CUSTOMER', 'DRIVER'])
  userType: 'CUSTOMER' | 'DRIVER';

  @IsOptional()
  @IsString()
  name?: string;
}

class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto.phone, dto.userType);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.phone, dto.otp, dto.userType, dto.name);
  }

  @Post('admin/login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.authService.adminLogin(dto.username, dto.password);
  }
}
