/**
 * Página raíz / — La landing oficial de Achilltest.
 */

import Landing from './landing/Landing'

export const metadata = {
  title:       'Achilltest — QA Automation con IA para América',
  description: 'De QA manual a QA automatizador. Genera y ejecuta tests de Playwright en minutos. Para equipos de toda América.',
}

export default function HomePage() {
  return <Landing/>
}
