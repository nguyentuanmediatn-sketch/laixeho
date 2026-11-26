import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Auth } from './auth.decorator';
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

class UpdateCustomerProfileDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

class RegisterFcmDto {
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
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

  @Auth('CUSTOMER', 'DRIVER')
  @Get('me')
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.sub, req.user.role);
  }

  @Auth('CUSTOMER')
  @Patch('profile')
  updateCustomerProfile(@Req() req: any, @Body() dto: UpdateCustomerProfileDto) {
    return this.authService.updateCustomerProfile(req.user.sub, dto.name);
  }

  @Auth('CUSTOMER', 'DRIVER')
  @Post('fcm-token')
  registerFcmToken(@Req() req: any, @Body() dto: RegisterFcmDto) {
    return this.authService.registerFcmToken(req.user.sub, req.user.role, dto.fcmToken);
  }
}
