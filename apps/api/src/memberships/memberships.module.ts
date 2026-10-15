import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MyMembershipsController } from './my-memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  controllers: [MembershipsController, MyMembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
