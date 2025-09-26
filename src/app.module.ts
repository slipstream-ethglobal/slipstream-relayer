import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RelayerController } from './controllers/relayer.controller';
import { RelayerService } from './services/relayer.service';
import { ChainConfigService } from './services/chain-config.service';
import { ContractManagerService } from './services/contract-manager.service';
import { LoggerService } from './services/logger.service';
import { GasEstimationService } from './services/gas-estimation.service';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests per minute
      },
    ]),
  ],
  controllers: [AppController, RelayerController],
  providers: [
    AppService,
    RelayerService,
    ChainConfigService,
    ContractManagerService,
    LoggerService,
    GasEstimationService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
