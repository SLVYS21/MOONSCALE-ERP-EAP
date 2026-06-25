import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.setGlobalPrefix('api')
  app.useWebSocketAdapter(new IoAdapter(app))

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  const port = process.env.PORT ?? 3001
  await app.listen(port)
  console.log(`🚀 Moonscale ERP backend running on http://localhost:${port}`)
}
bootstrap()
