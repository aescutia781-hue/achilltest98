import { authenticate } from '../middleware/auth.js'
import {
  getDeviceCatalog,
  getDevicesByCategory,
  getDeviceById,
} from '../config/devices.js'

export async function deviceRoutes(app) {

  // ── GET /api/devices ─────────────────────────────────────────────────────────
  // Lista completa de dispositivos disponibles
  app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
    const grouped = req.query.grouped === 'true'

    return reply.send({
      success: true,
      data: grouped ? getDevicesByCategory() : getDeviceCatalog(),
    })
  })

  // ── GET /api/devices/:id ────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const device = getDeviceById(req.params.id)
    if (!device) {
      return reply.code(404).send({ success: false, error: 'Dispositivo no encontrado' })
    }
    return reply.send({ success: true, data: device })
  })
}
