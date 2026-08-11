import { Controller, Get, Post, Patch, Param, Body, NotFoundException, ParseEnumPipe } from '@nestjs/common';
import { MerchantRepository } from './merchant.repository';
import { StoreStatus } from './merchant.entity';

const merchantRepository = new MerchantRepository();
merchantRepository.onModuleInit();

@Controller('api/v1/merchants')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'merchant-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Get()
  async getAllMerchants() {
    const merchants = await merchantRepository.findAllMerchants();
    return {
      success: true,
      count: merchants.length,
      merchants,
    };
  }

  @Get(':id')
  async getMerchantById(@Param('id') id: string) {
    const merchant = await merchantRepository.findMerchantById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant Store with ID '${id}' not found`);
    }
    return {
      success: true,
      merchant,
    };
  }

  @Post()
  async saveMerchant(@Body() body: any) {
    const saved = await merchantRepository.saveMerchant(body);
    return {
      success: true,
      merchant: saved,
    };
  }

  @Patch(':id/status')
  async updateStoreStatus(
    @Param('id') id: string,
    @Body('status', new ParseEnumPipe(StoreStatus)) status: StoreStatus
  ) {
    const updated = await merchantRepository.updateStoreStatus(id, status);
    if (!updated) {
      throw new NotFoundException(`Merchant Store with ID '${id}' not found`);
    }
    return {
      success: true,
      message: `Store operational status updated to ${status}`,
      merchant: updated,
    };
  }

  @Patch(':id/auto-accept')
  async updateAutoAccept(
    @Param('id') id: string,
    @Body('autoAccept') autoAccept: boolean
  ) {
    const updated = await merchantRepository.updateAutoAccept(id, autoAccept);
    if (!updated) {
      throw new NotFoundException(`Merchant Store with ID '${id}' not found`);
    }
    return {
      success: true,
      message: `Auto-Accept orders set to ${autoAccept}`,
      merchant: updated,
    };
  }
}
