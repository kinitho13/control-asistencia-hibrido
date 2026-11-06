import unittest
from types import SimpleNamespace

from fastapi import HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from auth import buscar_usuario_login, hash_password, validar_permisos, verificar_password
from models import Base, Usuario


def solicitud(path: str, method: str = "GET") -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "path": path,
            "headers": [(b"host", b"testserver")],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 1234),
            "scheme": "http",
            "root_path": "",
        }
    )


class PasswordTests(unittest.TestCase):
    def test_hash_verifica_solo_la_password_correcta(self):
        guardada = hash_password("secreto-seguro")

        self.assertTrue(verificar_password("secreto-seguro", guardada))
        self.assertFalse(verificar_password("otra-password", guardada))
        self.assertNotEqual(guardada, "secreto-seguro")

    def test_acepta_password_legacy_para_migracion_gradual(self):
        self.assertTrue(verificar_password("legacy", "legacy"))
        self.assertFalse(verificar_password("incorrecta", "legacy"))


class LoginLookupTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.usuario = Usuario(
            nombre="Usuario de prueba",
            usuario="Cristian.Caro",
            password=hash_password("clave-prueba"),
            rol="USUARIO",
            activo=True,
        )
        self.session.add(self.usuario)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_busca_login_sin_distinguir_mayusculas_o_espacios(self):
        encontrado = buscar_usuario_login(self.session, "  cRiStIaN.cArO ")

        self.assertEqual(encontrado.id, self.usuario.id)

    def test_login_inexistente_no_se_encuentra(self):
        self.assertIsNone(buscar_usuario_login(self.session, "otro.usuario"))


class PermissionTests(unittest.TestCase):
    def test_requiere_sesion_en_rutas_protegidas(self):
        with self.assertRaises(HTTPException) as error:
            validar_permisos(solicitud("/calendario"), None)

        self.assertEqual(error.exception.status_code, 401)

    def test_usuario_no_puede_modificar_asistencias(self):
        usuario = SimpleNamespace(id=1, rol="USUARIO")

        with self.assertRaises(HTTPException) as error:
            validar_permisos(solicitud("/asistencias", "POST"), usuario)

        self.assertEqual(error.exception.status_code, 403)

    def test_lider_puede_modificar_asistencias(self):
        validar_permisos(
            solicitud("/asistencias", "POST"),
            SimpleNamespace(id=2, rol="LIDER"),
        )

    def test_usuario_autenticado_puede_consultar_cierres(self):
        validar_permisos(
            solicitud("/cierres"),
            SimpleNamespace(id=3, rol="USUARIO"),
        )

    def test_lider_no_puede_administrar_usuarios(self):
        with self.assertRaises(HTTPException) as error:
            validar_permisos(
                solicitud("/usuarios/1", "DELETE"),
                SimpleNamespace(id=2, rol="LIDER"),
            )

        self.assertEqual(error.exception.status_code, 403)

    def test_usuario_puede_enviar_solicitud_para_validacion_de_propietario(self):
        validar_permisos(
            solicitud("/solicitudes", "POST"),
            SimpleNamespace(id=1, rol="USUARIO"),
        )

    def test_usuario_no_puede_resolver_solicitudes(self):
        with self.assertRaises(HTTPException) as error:
            validar_permisos(
                solicitud("/solicitudes/5/resolver", "POST"),
                SimpleNamespace(id=1, rol="USUARIO"),
            )

        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
