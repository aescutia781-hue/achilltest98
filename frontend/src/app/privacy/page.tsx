import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad — Achilltest',
}

const LAST_UPDATED = '14 de junio de 2026'

export default function PrivacyPage() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <Link href="/" style={backLinkStyle}>← Volver</Link>

        <h1 style={titleStyle}>Política de Privacidad</h1>
        <p style={lastUpdatedStyle}>Última actualización: {LAST_UPDATED}</p>

        <Section title="1. Quiénes somos">
          <P>
            Achilltest (en adelante, "nosotros") es operado por <strong>Angel Arturo Escutia García</strong>,
            con domicilio comercial en México. Esta Política de Privacidad describe cómo
            recopilamos, usamos y protegemos tu información personal.
          </P>
          <P>
            Para ejercer cualquiera de tus derechos descritos abajo, escríbenos a{' '}
            <a href="mailto:privacy@achilltest.io" style={linkStyle}>privacy@achilltest.io</a>.
          </P>
        </Section>

        <Section title="2. Datos que recopilamos">
          <H3>2.1 Datos de cuenta</H3>
          <Ul items={[
            'Nombre completo',
            'Email',
            'Contraseña (almacenada cifrada con bcrypt — nunca en texto plano)',
          ]}/>

          <H3>2.2 Datos de uso</H3>
          <Ul items={[
            'Tests, suites y proyectos que crees',
            'URLs target de tus tests (las páginas que quieres probar)',
            'Resultados de ejecuciones y reportes',
            'Logs de actividad (creaciones, ejecuciones, errores)',
            'Dirección IP y User Agent (logs de seguridad y debugging)',
          ]}/>

          <H3>2.3 Datos de facturación</H3>
          <P>
            Los datos de pago (tarjeta, etc.) son procesados directamente por <strong>Mercado Pago</strong>.
            Achilltest no almacena información de tarjetas de crédito. Solo guardamos el ID
            de suscripción y el estado del pago.
          </P>

          <H3>2.4 Datos de integraciones</H3>
          <P>
            Si conectas integraciones (GitHub, Jira, Zephyr Scale), almacenamos:
          </P>
          <Ul items={[
            'Tokens de acceso (cifrados con AES-256-GCM)',
            'Datos públicos de tu perfil (avatar, nombre)',
            'Metadatos de los proyectos seleccionados',
          ]}/>
          <P>
            Puedes revocar estas conexiones en cualquier momento desde la configuración.
          </P>
        </Section>

        <Section title="3. Para qué usamos tus datos">
          <Ul items={[
            'Proveer el Servicio (ejecutar tus tests, generar reportes)',
            'Procesar pagos y gestionar tu suscripción',
            'Enviarte emails transaccionales (verificación, recuperación de contraseña, alertas de pago)',
            'Comunicarte cambios importantes del Servicio',
            'Detectar y prevenir fraude o abuso',
            'Mejorar el Servicio (análisis agregados, sin identificarte individualmente)',
          ]}/>
          <P>
            <strong>NO utilizamos tus datos para:</strong>
          </P>
          <Ul items={[
            'Publicidad personalizada (no mostramos anuncios)',
            'Venta de información a terceros',
            'Entrenar modelos de IA propios',
          ]}/>
        </Section>

        <Section title="4. Inteligencia Artificial">
          <P>
            Cuando usas funciones de IA (Repair Agent, generación de tests), tu código y
            metadatos contextuales se envían a <strong>Anthropic</strong> (Claude API) para
            procesamiento. Anthropic tiene su propia política de privacidad:
            {' '}<a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              anthropic.com/legal/privacy
            </a>.
          </P>
          <P>
            Según los términos comerciales de Anthropic, los datos enviados a su API no se
            utilizan para entrenar modelos. Aun así, te recomendamos no enviar información
            sensible (datos personales, secretos, PII) en tus tests.
          </P>
        </Section>

        <Section title="5. Terceros con quienes compartimos datos">
          <P>
            Compartimos datos estrictamente con los siguientes proveedores, cada uno con su
            propia política de privacidad:
          </P>
          <Ul items={[
            'Mercado Pago — procesamiento de pagos',
            'Anthropic — funciones de IA (Repair Agent)',
            'Resend — envío de emails transaccionales',
            'Hetzner Cloud — hosting de infraestructura (servidor ubicado en Alemania)',
            'GitHub, Atlassian (Jira) — solo si conectas estas integraciones',
          ]}/>
          <P>
            No vendemos ni alquilamos datos personales a terceros.
          </P>
        </Section>

        <Section title="6. Conservación de datos">
          <Ul items={[
            'Datos de cuenta activa: mientras tengas cuenta',
            'Cuenta cancelada: 30 días, luego eliminación permanente',
            'Datos de facturación: 5 años (cumplimiento fiscal mexicano)',
            'Logs de seguridad: 90 días',
            'Backups: hasta 35 días',
          ]}/>
        </Section>

        <Section title="7. Tus derechos">
          <P>
            Bajo la Ley Federal de Protección de Datos Personales en Posesión de los
            Particulares (México) y, cuando aplique, el GDPR de la Unión Europea, tienes
            derecho a:
          </P>
          <Ul items={[
            'Acceso — saber qué datos tenemos sobre ti',
            'Rectificación — corregir datos inexactos',
            'Cancelación — solicitar la eliminación de tus datos',
            'Oposición — limitar el uso de tus datos para ciertos fines',
            'Portabilidad — recibir tus datos en formato estructurado',
          ]}/>
          <P>
            Para ejercer estos derechos, escríbenos a{' '}
            <a href="mailto:privacy@achilltest.io" style={linkStyle}>privacy@achilltest.io</a>{' '}
            con tu solicitud. Responderemos en un plazo máximo de 20 días hábiles.
          </P>
        </Section>

        <Section title="8. Seguridad">
          <P>
            Implementamos medidas técnicas y organizativas razonables para proteger tus datos:
          </P>
          <Ul items={[
            'Contraseñas almacenadas con bcrypt (cost 12)',
            'Tokens de integraciones cifrados con AES-256-GCM',
            'Comunicación HTTPS/TLS en toda la plataforma',
            'JWT con expiración para sesiones',
            'Backups automáticos diarios cifrados',
            'Acceso a la base de datos restringido y auditado',
          ]}/>
          <P>
            Si detectamos una brecha de seguridad que afecte tus datos, te notificaremos en
            un plazo máximo de 72 horas.
          </P>
        </Section>

        <Section title="9. Cookies">
          <P>
            Utilizamos cookies estrictamente necesarias para el funcionamiento del Servicio:
          </P>
          <Ul items={[
            'auth_token — mantener tu sesión iniciada',
            'org_context — recordar tu organización activa',
          ]}/>
          <P>
            No usamos cookies de tracking publicitario ni de terceros para analytics.
          </P>
        </Section>

        <Section title="10. Menores de edad">
          <P>
            El Servicio no está dirigido a menores de 18 años. Si descubres que un menor ha
            creado una cuenta, contáctanos para eliminarla.
          </P>
        </Section>

        <Section title="11. Cambios a esta política">
          <P>
            Podemos actualizar esta Política de Privacidad. Los cambios significativos se
            notificarán por email al menos 30 días antes de su entrada en vigor.
          </P>
        </Section>

        <Section title="12. Contacto">
          <P>
            Para cualquier pregunta o solicitud sobre tu privacidad:
          </P>
          <Ul items={[
            'Email: privacy@achilltest.io',
            'Responsable: Angel Arturo Escutia García',
            'Ubicación: México',
          ]}/>
        </Section>

        <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
          <Link href="/terms" style={linkStyle}>Términos de Servicio</Link>
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

function H3({ children }: any) {
  return <h3 style={{
    fontSize: '1rem', fontWeight: 600,
    color: '#c4a8ff', margin: '1rem 0 .375rem',
  }}>{children}</h3>
}

function P({ children }: any) {
  return <p style={paragraphStyle}>{children}</p>
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: '1.25rem', margin: '.5rem 0 .75rem' }}>
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
