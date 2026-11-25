import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type AppRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    return Boolean(user && requiredRoles.includes(user.role));
  }
}

export function Auth(...roles: AppRole[]) {
  if (roles.length === 0) {
    return applyDecorators(UseGuards(AuthGuard('jwt')));
  }
  return applyDecorators(Roles(...roles), UseGuards(AuthGuard('jwt'), RolesGuard));
}
