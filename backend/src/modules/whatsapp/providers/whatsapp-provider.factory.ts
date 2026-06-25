import { Provider } from '@nestjs/common'
import { SimulatorProvider } from './simulator.provider'
import { EvolutionProvider } from './evolution.provider'
import type { IWhatsAppProvider } from './whatsapp-provider.interface'

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER')

export const WhatsAppProviderFactory: Provider = {
  provide: WHATSAPP_PROVIDER,
  inject: [SimulatorProvider, EvolutionProvider],
  useFactory: (sim: SimulatorProvider, evo: EvolutionProvider): IWhatsAppProvider => {
    const name = (process.env.WHATSAPP_PROVIDER ?? 'simulator').toLowerCase()
    return name === 'evolution' ? evo : sim
  },
}
