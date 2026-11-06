import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from gestiones import (
    CierreInput,
    ResolucionInput,
    SolicitudInput,
    crear_cierre,
    crear_solicitud,
    eliminar_cierre,
    panel_lider,
    resolver_solicitud,
)
from models import Asistencia, Auditoria, Base, Reemplazo, Solicitud, Suplente, Usuario
from reemplazos import crear_reemplazo


class PanelLiderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.hoy = date(2026, 10, 26)
        self.admin = Usuario(nombre="Admin", rol="ADMIN", activo=True)
        self.persona = Usuario(nombre="Persona reemplazada", rol="USUARIO", activo=True)
        self.otra_persona = Usuario(nombre="Otra persona", rol="USUARIO", activo=True)
        self.suplente = Suplente(nombre="Suplente")
        self.session.add_all(
            [self.admin, self.persona, self.otra_persona, self.suplente]
        )
        self.session.flush()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def consultar_panel(self):
        return panel_lider(
            usuario_id=self.admin.id,
            fecha=self.hoy,
            db=self.session,
            actor=self.admin,
        )

    def test_reemplazo_muestra_suplente_y_no_persona_reemplazada(self):
        self.session.add_all(
            [
                Asistencia(
                    usuario_id=self.persona.id,
                    fecha=self.hoy,
                    modalidad="OFICINA",
                ),
                Reemplazo(
                    fecha=self.hoy,
                    usuario_id=self.persona.id,
                    suplente_id=self.suplente.id,
                ),
            ]
        )
        self.session.commit()

        panel = self.consultar_panel()

        self.assertEqual([persona["usuario"] for persona in panel["asistencias"]], ["Suplente"])
        self.assertEqual(panel["asistencias"][0]["reemplazo_de"], "Persona reemplazada")
        self.assertEqual(panel["total"], 1)
        self.assertEqual(panel["oficina"], 1)
        self.assertEqual(panel["casa"], 0)

    def test_personas_sin_reemplazo_conservan_su_modalidad(self):
        self.session.add(
            Asistencia(
                usuario_id=self.otra_persona.id,
                fecha=self.hoy,
                modalidad="CASA",
            )
        )
        self.session.commit()

        panel = self.consultar_panel()

        self.assertEqual(panel["asistencias"][0]["usuario"], "Otra persona")
        self.assertEqual(panel["asistencias"][0]["modalidad"], "CASA")
        self.assertEqual(panel["casa"], 1)
        self.assertEqual(panel["oficina"], 0)

    def test_reemplazo_sin_asistencia_original_cuenta_como_oficina(self):
        self.session.add(
            Reemplazo(
                fecha=self.hoy,
                usuario_id=self.persona.id,
                suplente_id=self.suplente.id,
            )
        )
        self.session.commit()

        panel = self.consultar_panel()

        self.assertEqual(panel["asistencias"][0]["usuario"], "Suplente")
        self.assertEqual(panel["oficina"], 1)

    def test_solicitudes_pendientes_se_cuentan_en_el_resumen(self):
        self.session.add(
            Solicitud(
                usuario_id=self.persona.id,
                tipo="AUSENCIA",
                fecha=self.hoy,
                motivo="Cita médica",
                estado="PENDIENTE",
            )
        )
        self.session.commit()

        self.assertEqual(self.consultar_panel()["pendientes"], 1)

    def test_aprobar_ausencia_actualiza_asistencia_y_trazabilidad(self):
        asistencia = Asistencia(
            usuario_id=self.persona.id,
            fecha=self.hoy,
            modalidad="OFICINA",
        )
        self.session.add(asistencia)
        self.session.commit()
        asistencia_id = asistencia.id

        solicitud = crear_solicitud(
            datos=SolicitudInput(
                usuario_id=self.persona.id,
                tipo="AUSENCIA",
                fecha=self.hoy,
                motivo="Cita médica",
            ),
            db=self.session,
            actor=self.persona,
        )
        resolver_solicitud(
            solicitud_id=solicitud["id"],
            datos=ResolucionInput(
                revisor_id=self.admin.id,
                aprobar=True,
                respuesta="Aprobada",
            ),
            db=self.session,
            actor=self.admin,
        )

        self.assertIsNone(
            self.session.query(Asistencia).filter_by(id=asistencia_id).first()
        )
        self.assertEqual(
            self.session.query(Auditoria).filter_by(entidad="solicitud").count(),
            2,
        )

    def test_crear_reemplazo_registra_evento_de_auditoria(self):
        resultado = crear_reemplazo(
            fecha=self.hoy,
            usuario_id=self.persona.id,
            suplente_id=self.suplente.id,
            motivo="Permiso",
            actor_id=self.admin.id,
            db=self.session,
            usuario_sesion=self.admin,
        )

        self.assertEqual(resultado["suplente_id"], self.suplente.id)
        evento = self.session.query(Auditoria).filter_by(entidad="reemplazo").one()
        self.assertEqual(evento.accion, "CREAR")

    def test_crear_y_eliminar_cierre_conserva_historial(self):
        cierre = crear_cierre(
            datos=CierreInput(
                actor_id=self.admin.id,
                fecha_inicio=self.hoy,
                fecha_fin=self.hoy,
                descripcion="Mantenimiento",
            ),
            db=self.session,
            usuario_sesion=self.admin,
        )
        eliminar_cierre(
            cierre_id=cierre["id"],
            actor_id=self.admin.id,
            db=self.session,
            usuario_sesion=self.admin,
        )

        self.assertEqual(self.session.query(Auditoria).filter_by(entidad="cierre").count(), 2)


if __name__ == "__main__":
    unittest.main()
