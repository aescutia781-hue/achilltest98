'use client'

import Link from 'next/link'

export const metadata = {
  title: 'Términos de Servicio — Achilltest',
}

const LAST_UPDATED = '14 de junio de 2026'

export default function TermsPage() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <Link href="/" style={backLinkStyle}>← Volver</Link>

        <h1 style={titleStyle}>Términos de Servicio</h1>
        <p style={lastUpdatedStyle}>Última actualización: {LAST_UPDATED}</p>

        <Section title="1. Aceptación de los términos">
          <P>
            Al crear una cuenta o utilizar Achilltest (en adelante, "el Servicio"), aceptas
            estos Términos de Servicio. Si no estás de acuerdo, no debes utilizar el Servicio.
          </P>
          <P>
            Achilltest es operado por <strong>Angel Arturo Escutia García</strong>, con domicilio
            comercial en México. Para cualquier consulta legal, escríbenos a{' '}
            <a href="mailto:legal@achilltest.io" style={linkStyle}>legal@achilltest.io</a>.
          </P>
        </Section>

        <Section title="2. Descripción del Servicio">
          <P>
            Achilltest es una plataforma de automatización de QA que permite a los usuarios
            generar, ejecutar y mantener tests automatizados utilizando inteligencia artificial.
            El Servicio incluye, entre otras funcionalidades:
          </P>
          <Ul items={[
            'Generación de tests E2E (Playwright)',
            'Testing de APIs',
            'Pruebas de accesibilidad (WCAG)',
            'Reportes Allure con histórico',
            'Integración con GitHub, Jira y Zephyr Scale',
            'Repair Agent con IA para mantener tests',
          ]}/>
          <P>
            Achilltest se reserva el derecho de modificar, suspender o discontinuar funciones
            del Servicio en cualquier momento, con aviso razonable cuando sea posible.
          </P>
        </Section>

        <Section title="3. Cuentas y registro">
          <P>
            Para utilizar el Servicio debes registrarte proporcionando información veraz y
            mantenerla actualizada. Eres responsable de:
          </P>
          <Ul items={[
            'Mantener la confidencialidad de tu contraseña',
            'Todas las actividades que ocurran bajo tu cuenta',
            'Notificarnos inmediatamente cualquier uso no autorizado',
          ]}/>
          <P>
            Achilltest no se hace responsable por pérdidas derivadas del incumplimiento de
            estas obligaciones por parte del usuario.
          </P>
        </Section>

        <Section title="4. Planes y facturación">
          <P>
            Achilltest ofrece un período de prueba gratuito de 5 días al registrarse. Tras
            este período, debes elegir un plan de pago para continuar utilizando el Servicio.
          </P>
          <P>
            Los pagos se procesan a través de Mercado Pago. Al suscribirte, autorizas el cargo
            recurrente del importe correspondiente al plan elegido. Puedes cancelar tu
            suscripción en cualquier momento desde tu cuenta.
          </P>
          <P>
            <strong>Reembolsos:</strong> No se ofrecen reembolsos por períodos parciales ya
            consumidos. Si cancelas, conservarás el acceso hasta el final del período facturado.
          </P>
          <P>
            Los precios pueden actualizarse con un aviso previo de al menos 30 días para
            usuarios existentes.
          </P>
        </Section>

        <Section title="5. Uso aceptable">
          <P>
            Te comprometes a NO utilizar el Servicio para:
          </P>
          <Ul items={[
            'Actividades ilegales o que violen derechos de terceros',
            'Generar tests destinados a atacar sitios sin autorización explícita',
            'Hacer ingeniería inversa, descompilar o intentar acceder al código fuente',
            'Revender, sublicenciar o transferir tu acceso sin autorización escrita',
            'Sobrecargar deliberadamente la infraestructura (uso abusivo de cuotas, scraping masivo)',
            'Generar tests con contenido ofensivo, discriminatorio o que viole leyes locales',
          ]}/>
          <P>
            Achilltest puede suspender o cerrar cuentas que violen estas políticas, sin
            reembolso.
          </P>
        </Section>

        <Section title="6. Propiedad intelectual">
          <P>
            <strong>Tu contenido:</strong> Conservas todos los derechos sobre los tests,
            datos y configuraciones que crees usando el Servicio. Nos otorgas una licencia
            limitada para procesarlos exclusivamente para operar el Servicio.
          </P>
          <P>
            <strong>Nuestro contenido:</strong> El código fuente, diseños, marcas, logos y
            documentación de Achilltest son propiedad exclusiva de Achilltest. No están
            licenciados para uso comercial, redistribución o creación de obras derivadas.
          </P>
        </Section>

        <Section title="7. Inteligencia Artificial y procesamiento de datos">
          <P>
            El Servicio utiliza modelos de IA de terceros (Anthropic Claude) para funciones
            como el Repair Agent. Al utilizar estas funciones:
          </P>
          <Ul items={[
            'Tu código de tests y datos contextuales se envían al proveedor de IA para procesamiento',
            'Estos proveedores tienen sus propias políticas de retención (consulta los términos de Anthropic)',
            'No utilizamos tu contenido para entrenar modelos de IA propios',
          ]}/>
        </Section>

        <Section title="8. Limitación de responsabilidad">
          <P>
            El Servicio se ofrece "tal cual" y "según disponibilidad", sin garantías de
            ningún tipo, expresas o implícitas. Achilltest no garantiza que:
          </P>
          <Ul items={[
            'El Servicio esté libre de errores o interrupciones',
            'Los tests generados sean perfectos o exhaustivos',
            'Las sugerencias del Repair Agent sean siempre correctas',
          ]}/>
          <P>
            En la medida máxima permitida por la ley aplicable, Achilltest no será responsable
            por daños indirectos, incidentales, especiales o consecuentes, incluyendo pérdida
            de beneficios, datos o uso, derivados del uso del Servicio.
          </P>
          <P>
            La responsabilidad total de Achilltest, en cualquier caso, se limita al monto
            pagado por el usuario en los 12 meses anteriores al incidente.
          </P>
        </Section>

        <Section title="9. Privacidad">
          <P>
            El tratamiento de tus datos personales se rige por nuestra{' '}
            <Link href="/privacy" style={linkStyle}>Política de Privacidad</Link>, que forma
            parte integral de estos Términos.
          </P>
        </Section>

        <Section title="10. Cancelación de cuenta">
          <P>
            Puedes cancelar tu cuenta en cualquier momento desde la configuración. Al hacerlo:
          </P>
          <Ul items={[
            'Tu acceso al Servicio se mantiene hasta el final del período pagado',
            'Tus datos se conservan por 30 días por si decides reactivar la cuenta',
            'Después de 30 días, tus datos se eliminan permanentemente (excepto registros legales requeridos)',
          ]}/>
        </Section>

        <Section title="11. Cambios a los términos">
          <P>
            Podemos modificar estos Términos en cualquier momento. Los cambios significativos
            se notificarán por email al menos 30 días antes de su entrada en vigor. El uso
            continuado del Servicio después de los cambios constituye tu aceptación.
          </P>
        </Section>

        <Section title="12. Ley aplicable y jurisdicción">
          <P>
            Estos Términos se rigen por las leyes de México. Cualquier disputa se resolverá
            en los tribunales competentes de la Ciudad de México, renunciando expresamente
            a cualquier otro fuero que pudiera corresponder.
          </P>
        </Section>

        <Section title="13. Contacto">
          <P>
            Para cualquier pregunta sobre estos Términos, escríbenos a{' '}
            <a href="mailto:legal@achilltest.io" style={linkStyle}>legal@achilltest.io</a>.
          </P>
        </Section>

        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
          <Link href="/privacy" style={linkStyle}>Política de Privacidad</Link>
          {' · '}
          <Link href="/" style={linkStyle}>Inicio</Link>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──

function Section({ title, children }: any) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: any) {
  return <p style={paragraphStyle}>{children}</p>
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: '1.25rem', margin: '.75rem 0' }}>
      {items.map((it, i) => (
        <li key={i} style={{
          color: '#c4c4d8', fontSize: '.9375rem',
          lineHeight: 1.7, marginBottom: '.25rem',
        }}>{it}</li>
      ))}
    </ul>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#08080f',
  color: '#c4c4d8', fontFamily: 'Inter,system-ui,sans-serif',
  padding: '3rem 1.5rem',
}
const containerStyle: React.CSSProperties = {
  maxWidth: 760, margin: '0 auto',
}
const backLinkStyle: React.CSSProperties = {
  color: '#7070a0', fontSize: '.875rem',
  textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem',
}
const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
  fontWeight: 700, color: '#f0f0fc',
  letterSpacing: '-.025em', marginBottom: '.5rem',
}
const lastUpdatedStyle: React.CSSProperties = {
  color: '#7070a0', fontSize: '.8125rem',
  marginBottom: '2.5rem',
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1.125rem', fontWeight: 600,
  color: '#f0f0fc', marginBottom: '.75rem',
  letterSpacing: '-.01em',
}
const paragraphStyle: React.CSSProperties = {
  color: '#c4c4d8', fontSize: '.9375rem',
  lineHeight: 1.7, marginBottom: '.75rem',
}
const linkStyle: React.CSSProperties = {
  color: '#c4a8ff', textDecoration: 'underline',
}
