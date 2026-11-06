import unittest
from datetime import date, time, timedelta

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from marcaciones import (
    EntradaInput,
    RegistroEquipoInput,
    guardar_marcacion_equipo,
    listar_marcaciones_equipo,
    listar_marcaciones_propias,
    marcar_entrada,
    marcar_salida,
)
from models import Auditoria, Base, RegistroAsistencia, Usuario


class MarcacionesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.usuario = Usuario(nombre="Persona", usuario="persona", rol="USUARIO", activo=True)
        self.lider = Usuario(nombre="Líder", usuario="lider", rol="LIDER", activo=True)
        self.session.add_all([self.usuario, self.lider])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_usuario_marca_entrada_y_salida_en_su_registro(self):
        entrada = marcar_entrada(
            EntradaInput(modalidad="CASA"),
            db=self.session,
            actor=self.usuario,
        )

        self.assertEqual(entrada["estado"], "PRESENTE")
        self.assertEqual(entrada["modalidad"], "CASA")
        self.assertTrue(entrada["entrada"].endswith("-05:00"))

        salida = marcar_salida(db=self.session, actor=self.usuario)

        self.assertIsNotNone(salida["salida"])
        self.assertEqual(
            self.session.query(Auditoria)
            .filter_by(entidad="registro_asistencia")
            .count(),
            2,
        )

    def test_usuario_no_puede_marcar_entrada_dos_veces(self):
        marcar_entrada(
            EntradaInput(modalidad="OFICINA"),
            db=self.session,
            actor=self.usuario,
        )

        with self.assertRaises(HTTPException) as error:
            marcar_entrada(
                EntradaInput(modalidad="OFICINA"),
                db=self.session,
                actor=self.usuario,
            )

        self.assertEqual(error.exception.status_code, 409)

    def test_usuario_no_puede_marcar_entrada_si_fue_registrado_ausente(self):
        self.session.add(
            RegistroAsistencia(
                usuario_id=self.usuario.id,
                fecha=date.today(),
                estado="AUSENTE",
            )
        )
        self.session.commit()

        with self.assertRaises(HTTPException) as error:
            marcar_entrada(
                EntradaInput(modalidad="OFICINA"),
                db=self.session,
                actor=self.usuario,
            )

        self.assertEqual(error.exception.status_code, 409)

    def test_salida_requiere_entrada(self):
        with self.assertRaises(HTTPException) as error:
            marcar_salida(db=self.session, actor=self.usuario)

        self.assertEqual(error.exception.status_code, 409)

    def test_usuario_solo_consulta_sus_registros(self):
        otro = Usuario(nombre="Otra persona", usuario="otra", rol="USUARIO", activo=True)
        self.session.add(otro)
        self.session.flush()
        self.session.add_all(
            [
                RegistroAsistencia(
                    usuario_id=self.usuario.id,
                    fecha=date.today(),
                    estado="PRESENTE",
                    modalidad="OFICINA",
                ),
                RegistroAsistencia(
                    usuario_id=otro.id,
                    fecha=date.today(),
                    estado="PRESENTE",
                    modalidad="CASA",
                ),
            ]
        )
        self.session.commit()

        registros = listar_marcaciones_propias(db=self.session, actor=self.usuario)

        self.assertEqual(len(registros), 1)
        self.assertEqual(registros[0]["usuario_id"], self.usuario.id)

    def test_pase_de_lista_rechaza_usuario_sin_rol_de_gestion(self):
        with self.assertRaises(HTTPException) as error:
            listar_marcaciones_equipo(
                fecha=date.today(),
                db=self.session,
                actor=self.usuario,
            )

        self.assertEqual(error.exception.status_code, 403)

    def test_lider_puede_marcar_y_auditar_asistencia_del_equipo(self):
        fecha = date.today() - timedelta(days=1)
        resultado = guardar_marcacion_equipo(
            usuario_id=self.usuario.id,
            datos=RegistroEquipoInput(
                estado="PRESENTE",
                modalidad="OFICINA",
                entrada=time(8, 30),
                salida=time(17, 0),
            ),
            fecha=fecha,
            db=self.session,
            actor=self.lider,
        )

        self.assertEqual(resultado["estado"], "PRESENTE")
        self.assertTrue(resultado["entrada"].endswith("-05:00"))
        self.assertEqual(resultado["entrada"][11:16], "08:30")
        evento = self.session.query(Auditoria).filter_by(entidad="registro_asistencia").one()
        self.assertEqual(evento.actor_id, self.lider.id)

    def test_pase_historico_sin_hora_no_asigna_la_hora_actual(self):
        fecha = date.today() - timedelta(days=1)
        resultado = guardar_marcacion_equipo(
            usuario_id=self.usuario.id,
            datos=RegistroEquipoInput(estado="PRESENTE", modalidad="CASA"),
            fecha=fecha,
            db=self.session,
            actor=self.lider,
        )

        self.assertIsNone(resultado["entrada"])

    def test_salida_del_equipo_requiere_hora_de_entrada(self):
        with self.assertRaises(HTTPException) as error:
            guardar_marcacion_equipo(
                usuario_id=self.usuario.id,
                datos=RegistroEquipoInput(
                    estado="PRESENTE",
                    modalidad="OFICINA",
                    salida=time(17, 0),
                ),
                fecha=date.today(),
                db=self.session,
                actor=self.lider,
            )

        self.assertEqual(error.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
