import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_URL, apiFetch } from "../config";
import Icono from "../components/Icono";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const COLOR_CASA = "#5eead4";
const COLOR_OFICINA = "#93c5fd";

const FILTROS = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "mixto", etiqueta: "Híbridos" },
  { valor: "casa", etiqueta: "Solo casa" },
  { valor: "oficina", etiqueta: "Solo oficina" },
];

const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

const dosDigitos = (n) => String(n).padStart(2, "0");

// "2026-10-20" o "2026-10-20T00:00:00" -> { anio: 2026, mes: 9, dia: 20 } (mes base 0, sin desfase de zona horaria)
const partesFecha = (valor) => {
  const [a, m, d] = String(valor).slice(0, 10).split("-").map(Number);
  return { anio: a, mes: m - 1, dia: d };
};

const formatearPorcentaje = (parte, total) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

// "Cristian Caro" -> "CC"; "Ana" -> "A"
const iniciales = (nombre) =>
  String(nombre)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join("");

const compararNombres = (a, b) => String(a).localeCompare(String(b), "es");

const esFinDeSemana = (anio, mes, dia) => {
  const d = new Date(anio, mes, dia).getDay();
  return d === 0 || d === 6;
};

const variacion = (actual, previo) =>
  previo > 0 ? Math.round(((actual - previo) / previo) * 100) : null;

const flecha = (valor) => (valor > 0 ? "▲" : valor < 0 ? "▼" : "=");

const textoDelta = (actual, previo) => {
  const v = variacion(actual, previo);
  return v === null ? null : `${flecha(v)} ${Math.abs(v)}% vs mes ant.`;
};

const ESTILO_TOOLTIP = {
  background: "#111827",
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 10,
  color: "#f8fafc",
};

const EJE = { fill: "#b8c1d9", fontSize: 11 };

// Evita que Excel interprete un nombre como fórmula (=, +, -, @).
const celdaCsv = (valor) => {
  let texto = String(valor ?? "");
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
};

// Agrupa las asistencias por día: quién está en casa y quién en oficina.
const agruparPorDia = (lista) => {
  const mapa = new Map();
  lista.forEach((r) => {
    if (!mapa.has(r.dia)) mapa.set(r.dia, { casa: [], oficina: [] });
    mapa.get(r.dia)[r.modalidad === "CASA" ? "casa" : "oficina"].push(r.usuario);
  });
  mapa.forEach((detalle) => {
    detalle.casa.sort(compararNombres);
    detalle.oficina.sort(compararNombres);
  });
  return mapa;
};

// Selector de personas con búsqueda. Sin nadie marcado significa "todas".
function FiltroPersonas({ id, opciones, seleccion, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState("");
  const contenedor = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarFuera = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    };
    const cerrarConEsc = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarFuera);
    document.addEventListener("keydown", cerrarConEsc);
    return () => {
      document.removeEventListener("mousedown", cerrarFuera);
      document.removeEventListener("keydown", cerrarConEsc);
    };
  }, [abierto]);

  const termino = buscar.trim().toLowerCase();
  const visibles = opciones.filter((o) => o.nombre.toLowerCase().includes(termino));

  const alternar = (idPersona) => {
    const nueva = new Set(seleccion);
    if (nueva.has(idPersona)) nueva.delete(idPersona);
    else nueva.add(idPersona);
    onChange(nueva);
  };

  let etiqueta = "Todas las personas";
  if (seleccion.size === 1) {
    etiqueta = opciones.find((o) => seleccion.has(o.id))?.nombre ?? "1 persona";
  } else if (seleccion.size > 1) {
    etiqueta = `${seleccion.size} personas`;
  }

  return (
    <div className="filtro" ref={contenedor}>
      <button
        type="button"
        className={`boton boton--filtro${seleccion.size > 0 ? " boton--activo" : ""}`}
        aria-expanded={abierto}
        aria-controls={`${id}-panel`}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="filtro__etiqueta">{etiqueta}</span>
        <span className={`filtro__flecha${abierto ? " filtro__flecha--abierta" : ""}`} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="filtro__panel" id={`${id}-panel`} role="group" aria-label="Filtrar por personas">
          <input
            type="search"
            className="personas__buscar"
            placeholder="Buscar persona"
            aria-label="Buscar en la lista de personas"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            autoFocus
          />
          <div className="filtro__acciones">
            <button
              type="button"
              className="filtro__enlace"
              onClick={() => onChange(new Set(visibles.map((o) => o.id)))}
              disabled={visibles.length === 0}
            >
              Marcar {termino ? "visibles" : "todas"}
            </button>
            <button
              type="button"
              className="filtro__enlace"
              onClick={() => onChange(new Set())}
              disabled={seleccion.size === 0}
            >
              Quitar filtro
            </button>
          </div>
          <ul className="filtro__lista">
            {visibles.map((o) => (
              <li key={o.id}>
                <label className="filtro__opcion">
                  <input
                    type="checkbox"
                    checked={seleccion.has(o.id)}
                    onChange={() => alternar(o.id)}
                  />
                  <span className="nombres__avatar" aria-hidden="true">{iniciales(o.nombre)}</span>
                  <span className="nombres__texto" title={o.nombre}>{o.nombre}</span>
                </label>
              </li>
            ))}
            {visibles.length === 0 && <li className="persona__grupo-vacio">Sin coincidencias.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Dashboard({ usuario }) {
  const hoy = new Date();
  const hoyAnio = hoy.getFullYear();
  const hoyMes = hoy.getMonth();
  const hoyDia = hoy.getDate();

  const [usuarios, setUsuarios] = useState([]);
  const [restricciones, setRestricciones] = useState([]);
  const [asistencias, setAsistencias] = useState([]);
  const [festivos, setFestivos] = useState([]);
  const [mes, setMes] = useState(hoyMes);
  const [anio, setAnio] = useState(hoyAnio);
  const [listo, setListo] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [panelLider, setPanelLider] = useState(null);
  const [errorLider, setErrorLider] = useState("");
  const [personaAbierta, setPersonaAbierta] = useState(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [verSinAsignar, setVerSinAsignar] = useState(false);
  // Personas elegidas en los filtros (vacío = todas). Lo comparten la lista y el calendario.
  const [personasSel, setPersonasSel] = useState(() => new Set());
  const esLider = ["ADMIN", "LIDER"].includes(usuario?.rol?.toUpperCase());

  // ---------- Carga de datos ----------
  // Solo se pide el año visible más diciembre del anterior (para comparar enero).
  useEffect(() => {
    const controlador = new AbortController();

    const cargar = async () => {
      setActualizando(true);
      setError(null);

      const pedir = async (ruta) => {
        const res = await apiFetch(ruta, { signal: controlador.signal });
        if (!res.ok) throw new Error(`Error en ${ruta}`);
        return res.json();
      };

      try {
        const [dUsuarios, dRestricciones, dAsistencias, dFestivos] = await Promise.all([
          pedir("/usuarios"),
          pedir("/restricciones"),
          pedir(`/calendario?desde=${anio - 1}-12-01&hasta=${anio}-12-31`),
          // Los festivos son un complemento: si fallan, el panel sigue funcionando.
          pedir("/festivos").catch(() => []),
        ]);

        setUsuarios(dUsuarios);
        setRestricciones(dRestricciones);
        setAsistencias(dAsistencias);
        setFestivos(dFestivos);
        setListo(true);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(`No se pudieron cargar los datos. Verifica que el servidor esté activo en ${API_URL}.`);
        }
      } finally {
        if (!controlador.signal.aborted) setActualizando(false);
      }
    };

    cargar();
    return () => controlador.abort();
  }, [anio, intento]);

  useEffect(() => {
    if (!esLider || !usuario?.id) return;
    const controlador = new AbortController();
    apiFetch(`/panel-lider?usuario_id=${usuario.id}`, { signal: controlador.signal })
      .then(async (respuesta) => {
        const datos = await respuesta.json();
        if (!respuesta.ok) throw new Error(datos?.detail || "No se pudo cargar el panel de líderes.");
        setPanelLider(datos);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setErrorLider(e.message);
      });
    return () => controlador.abort();
  }, [esLider, usuario?.id]);

  // Al cambiar de periodo se cierran los detalles para no mostrar días de otro mes.
  useEffect(() => {
    setPersonaAbierta(null);
    setDiaSeleccionado(null);
  }, [mes, anio]);

  // ---------- Navegación de periodo ----------
  const cambiarMes = (delta) => {
    const indice = anio * 12 + mes + delta;
    const nuevoAnio = Math.floor(indice / 12);
    if (nuevoAnio < ANIO_MIN || nuevoAnio > ANIO_MAX) return;
    setAnio(nuevoAnio);
    setMes(((indice % 12) + 12) % 12);
  };

  const irAHoy = () => {
    setAnio(hoyAnio);
    setMes(hoyMes);
  };

  const opcionesAnio = useMemo(() => {
    const desde = Math.max(ANIO_MIN, Math.min(anio, hoyAnio - 3));
    const hasta = Math.min(ANIO_MAX, Math.max(anio, hoyAnio + 3));
    return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  }, [anio, hoyAnio]);

  // ---------- Datos derivados ----------
  // Cada asistencia se interpreta una sola vez (fecha en números, no en texto).
  const registros = useMemo(
    () =>
      asistencias
        .filter((a) => a.modalidad === "CASA" || a.modalidad === "OFICINA")
        .map((a) => ({
          ...partesFecha(a.fecha),
          usuarioId: a.usuario_id ?? a.usuario,
          usuario: a.usuario,
          modalidad: a.modalidad,
        }))
        .filter((r) => Number.isFinite(r.dia) && Number.isFinite(r.mes)),
    [asistencias]
  );

  const asistenciasDelMes = useMemo(
    () => registros.filter((r) => r.anio === anio && r.mes === mes),
    [registros, anio, mes]
  );

  const festivosDelMes = useMemo(() => {
    const mapa = new Map();
    festivos.forEach((f) => {
      const p = partesFecha(f.fecha);
      if (p.anio === anio && p.mes === mes) mapa.set(p.dia, f.descripcion);
    });
    return mapa;
  }, [festivos, anio, mes]);

  const { casa, oficina, total, porUsuario } = useMemo(() => {
    const acumulado = new Map();
    let casa = 0;
    let oficina = 0;

    asistenciasDelMes.forEach((r) => {
      if (!acumulado.has(r.usuarioId)) {
        acumulado.set(r.usuarioId, { nombre: r.usuario, casa: 0, oficina: 0, dias: [] });
      }
      const registro = acumulado.get(r.usuarioId);

      if (r.modalidad === "CASA") {
        casa += 1;
        registro.casa += 1;
      } else {
        oficina += 1;
        registro.oficina += 1;
      }
      registro.dias.push({ dia: r.dia, modalidad: r.modalidad });
    });

    const porUsuario = [...acumulado.entries()]
      .map(([id, valores]) => ({
        id,
        nombre: valores.nombre,
        casa: valores.casa,
        oficina: valores.oficina,
        total: valores.casa + valores.oficina,
        dias: valores.dias.sort((x, y) => x.dia - y.dia),
      }))
      .sort((a, b) => b.total - a.total || compararNombres(a.nombre, b.nombre));

    return { casa, oficina, total: casa + oficina, porUsuario };
  }, [asistenciasDelMes]);

  // Quién está en casa / oficina cada día del mes (todas las personas).
  const detalleDias = useMemo(() => agruparPorDia(asistenciasDelMes), [asistenciasDelMes]);

  // Lo mismo, pero solo con las personas elegidas en el filtro (lo que muestra el calendario).
  const hayFiltroPersonas = personasSel.size > 0;
  const detalleDiasVista = useMemo(
    () =>
      hayFiltroPersonas
        ? agruparPorDia(asistenciasDelMes.filter((r) => personasSel.has(r.usuarioId)))
        : detalleDias,
    [hayFiltroPersonas, personasSel, asistenciasDelMes, detalleDias]
  );

  const { diaPicoVista, diasConRegistroVista } = useMemo(() => {
    let pico = null;
    detalleDiasVista.forEach((detalle, dia) => {
      const cantidad = detalle.casa.length + detalle.oficina.length;
      if (!pico || cantidad > pico.cantidad) pico = { dia, cantidad };
    });
    return { diaPicoVista: pico, diasConRegistroVista: detalleDiasVista.size };
  }, [detalleDiasVista]);

  // Cobertura del calendario y ocupación de la oficina (los festivos no cuentan como día hábil).
  const { diasHabiles, sinProgramar, ocupacionMedia, picoOficina } = useMemo(() => {
    const diasDelMes = new Date(anio, mes + 1, 0).getDate();
    let habiles = 0;
    const sin = [];
    for (let dia = 1; dia <= diasDelMes; dia += 1) {
      if (esFinDeSemana(anio, mes, dia) || festivosDelMes.has(dia)) continue;
      habiles += 1;
      const detalle = detalleDias.get(dia);
      if (!detalle || detalle.casa.length + detalle.oficina.length === 0) sin.push(dia);
    }

    let sumaOficina = 0;
    let pico = null;
    detalleDias.forEach((detalle, dia) => {
      sumaOficina += detalle.oficina.length;
      if (!pico || detalle.oficina.length > pico.cantidad) pico = { dia, cantidad: detalle.oficina.length };
    });

    return {
      diasHabiles: habiles,
      sinProgramar: sin,
      ocupacionMedia: detalleDias.size > 0 ? Math.round((sumaOficina / detalleDias.size) * 10) / 10 : 0,
      picoOficina: pico,
    };
  }, [anio, mes, detalleDias, festivosDelMes]);

  // Mes anterior, para comparar.
  const mesAnterior = useMemo(() => {
    const m = mes === 0 ? 11 : mes - 1;
    const a = mes === 0 ? anio - 1 : anio;
    let casaPrev = 0;
    let oficinaPrev = 0;
    registros.forEach((r) => {
      if (r.anio !== a || r.mes !== m) return;
      if (r.modalidad === "CASA") casaPrev += 1;
      else oficinaPrev += 1;
    });
    const totalPrev = casaPrev + oficinaPrev;
    return {
      casa: casaPrev,
      oficina: oficinaPrev,
      total: totalPrev,
      porcentajeCasa: formatearPorcentaje(casaPrev, totalPrev),
    };
  }, [registros, mes, anio]);

  const porcentajeCasa = formatearPorcentaje(casa, total);
  const porcentajeOficina = total > 0 ? Math.round((100 - porcentajeCasa) * 10) / 10 : 0;
  const distribucion = [
    { nombre: "Casa", total: casa, color: COLOR_CASA },
    { nombre: "Oficina", total: oficina, color: COLOR_OFICINA },
  ];

  // Referencia para que la barra de cada persona también exprese su volumen de días.
  const maximoDiasPorPersona = porUsuario.reduce((maximo, p) => Math.max(maximo, p.total), 0);
  const promedioPorPersona = porUsuario.length > 0
    ? Math.round((total / porUsuario.length) * 10) / 10
    : 0;

  // Solo usuarios activos cuentan como "sin asignación"; se identifican por id, no por nombre.
  const usuariosActivos = useMemo(() => usuarios.filter((u) => u.activo !== false), [usuarios]);
  const inactivos = usuarios.length - usuariosActivos.length;

  const nombresSinAsignar = useMemo(() => {
    const conAsignacion = new Set(porUsuario.map((p) => p.id));
    return usuariosActivos
      .filter((u) => !conAsignacion.has(u.id))
      .map((u) => u.nombre)
      .sort(compararNombres);
  }, [usuariosActivos, porUsuario]);
  const sinAsignacion = nombresSinAsignar.length;

  const soloCasa = porUsuario.filter((p) => p.oficina === 0).length;
  const soloOficina = porUsuario.filter((p) => p.casa === 0).length;

  // Personas que se pueden elegir en el filtro: usuarios activos y quien tenga asistencias en el mes.
  const opcionesPersonas = useMemo(() => {
    const mapa = new Map();
    usuariosActivos.forEach((u) => mapa.set(u.id, u.nombre));
    porUsuario.forEach((p) => mapa.set(p.id, p.nombre));
    return [...mapa.entries()]
      .map(([idPersona, nombre]) => ({ id: idPersona, nombre }))
      .sort((a, b) => compararNombres(a.nombre, b.nombre));
  }, [usuariosActivos, porUsuario]);

  const personasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return porUsuario.filter((p) => {
      if (hayFiltroPersonas && !personasSel.has(p.id)) return false;
      if (termino && !p.nombre.toLowerCase().includes(termino)) return false;
      if (filtro === "casa") return p.oficina === 0;
      if (filtro === "oficina") return p.casa === 0;
      if (filtro === "mixto") return p.casa > 0 && p.oficina > 0;
      return true;
    });
  }, [porUsuario, busqueda, filtro, hayFiltroPersonas, personasSel]);

  const tendenciaAnual = useMemo(() => {
    const mensual = MESES.map((nombre) => ({ mes: nombre.slice(0, 3), casa: 0, oficina: 0 }));
    registros.forEach((r) => {
      if (r.anio !== anio || !mensual[r.mes]) return;
      if (r.modalidad === "CASA") mensual[r.mes].casa += 1;
      else mensual[r.mes].oficina += 1;
    });
    return mensual;
  }, [registros, anio]);

  const distribucionSemanal = useMemo(() => {
    const dias = DIAS.slice(0, 5).map((nombre) => ({ dia: nombre, casa: 0, oficina: 0 }));
    asistenciasDelMes.forEach((r) => {
      const dia = new Date(r.anio, r.mes, r.dia).getDay();
      if (dia < 1 || dia > 5) return;
      dias[dia - 1][r.modalidad === "CASA" ? "casa" : "oficina"] += 1;
    });
    return dias;
  }, [asistenciasDelMes]);

  const esMesActual = anio === hoyAnio && mes === hoyMes;

  const calendarioMes = useMemo(() => {
    const diasDelMes = new Date(anio, mes + 1, 0).getDate();
    const primerDia = (new Date(anio, mes, 1).getDay() + 6) % 7;
    let maximo = 1;
    detalleDiasVista.forEach((d) => {
      maximo = Math.max(maximo, d.casa.length + d.oficina.length);
    });
    return [
      ...Array.from({ length: primerDia }, (_, indice) => ({ clave: `vacio-${indice}`, vacio: true })),
      ...Array.from({ length: diasDelMes }, (_, indice) => {
        const dia = indice + 1;
        const detalle = detalleDiasVista.get(dia);
        const casaDia = detalle ? detalle.casa.length : 0;
        const oficinaDia = detalle ? detalle.oficina.length : 0;
        const totalDia = casaDia + oficinaDia;
        return {
          clave: `${anio}-${mes}-${dia}`,
          dia,
          casa: casaDia,
          oficina: oficinaDia,
          total: totalDia,
          intensidad: totalDia ? 0.1 + (totalDia / maximo) * 0.3 : 0,
          finDeSemana: esFinDeSemana(anio, mes, dia),
          festivo: festivosDelMes.get(dia) ?? null,
          esHoy: anio === hoyAnio && mes === hoyMes && dia === hoyDia,
        };
      }),
    ];
  }, [anio, mes, detalleDiasVista, festivosDelMes, hoyAnio, hoyMes, hoyDia]);

  const fechaHoy = hoy.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const diaSemana = (dia) => DIAS[(new Date(anio, mes, dia).getDay() + 6) % 7];

  // Día mostrado en el detalle: el elegido, o hoy (si es el mes actual), o el de mayor actividad.
  const diaPorDefecto = esMesActual ? hoyDia : diaPicoVista?.dia ?? null;
  const diaActivo = diaSeleccionado ?? diaPorDefecto;
  const detalleActivo = diaActivo ? detalleDiasVista.get(diaActivo) : null;
  const festivoActivo = diaActivo ? festivosDelMes.get(diaActivo) : null;
  const casaActiva = detalleActivo ? detalleActivo.casa.length : 0;
  const oficinaActiva = detalleActivo ? detalleActivo.oficina.length : 0;

  const coberturaPct = diasHabiles > 0
    ? Math.round(((diasHabiles - sinProgramar.length) / diasHabiles) * 100)
    : 0;

  const deltaRemoto = total > 0 && mesAnterior.total > 0
    ? (() => {
        const d = Math.round((porcentajeCasa - mesAnterior.porcentajeCasa) * 10) / 10;
        return `${flecha(d)} ${Math.abs(d)} pp vs mes ant.`;
      })()
    : null;

  const estadisticas = [
    {
      etiqueta: "Usuarios activos",
      valor: usuariosActivos.length,
      icono: "usuarios",
      nota: inactivos > 0 ? `${inactivos} ${inactivos === 1 ? "inactivo" : "inactivos"}` : null,
    },
    { etiqueta: "Restricciones", valor: restricciones.length, icono: "restricciones" },
    { etiqueta: "Asignaciones", valor: total, icono: "asistencias", nota: textoDelta(total, mesAnterior.total) },
    { etiqueta: "Días en casa", valor: casa, icono: "casa", nota: textoDelta(casa, mesAnterior.casa) },
    { etiqueta: "Días en oficina", valor: oficina, icono: "oficina", nota: textoDelta(oficina, mesAnterior.oficina) },
    { etiqueta: "Trabajo remoto", valor: `${porcentajeCasa}%`, icono: "remoto", nota: deltaRemoto },
    {
      etiqueta: "Cobertura",
      valor: `${coberturaPct}%`,
      icono: "asistencias",
      nota: `${diasHabiles - sinProgramar.length} de ${diasHabiles} días hábiles`,
    },
    {
      etiqueta: "Oficina por día",
      valor: ocupacionMedia,
      icono: "oficina",
      nota: picoOficina ? `Pico: ${picoOficina.cantidad} el día ${picoOficina.dia}` : "Sin registros",
    },
  ];

  // Lo que requiere atención este mes. Las alertas con acción se pueden pulsar.
  const alertas = [];
  if (sinAsignacion > 0) {
    alertas.push({
      clave: "sin-asignar",
      tono: "aviso",
      texto: `${sinAsignacion} ${sinAsignacion === 1 ? "usuario sin asignación" : "usuarios sin asignación"}`,
      titulo: "Ver quiénes son",
      accion: () => setVerSinAsignar(true),
    });
  }
  if (sinProgramar.length > 0 && total > 0) {
    alertas.push({
      clave: "sin-programar",
      tono: "aviso",
      texto: `${sinProgramar.length} ${sinProgramar.length === 1 ? "día hábil sin programación" : "días hábiles sin programación"}`,
      titulo: `Días: ${sinProgramar.join(", ")}. Los festivos no se cuentan; revisa si hubo cierre de oficina.`,
      accion: () => setDiaSeleccionado(sinProgramar[0]),
    });
  }
  if (soloCasa > 0) {
    alertas.push({
      clave: "solo-casa",
      tono: "info",
      texto: `${soloCasa} ${soloCasa === 1 ? "persona sin ningún día en oficina" : "personas sin ningún día en oficina"}`,
      titulo: "Filtrar la lista",
      accion: () => setFiltro("casa"),
    });
  }
  if (soloOficina > 0) {
    alertas.push({
      clave: "solo-oficina",
      tono: "info",
      texto: `${soloOficina} ${soloOficina === 1 ? "persona sin ningún día en casa" : "personas sin ningún día en casa"}`,
      titulo: "Filtrar la lista",
      accion: () => setFiltro("oficina"),
    });
  }

  // ---------- Acciones ----------
  const alternarPersona = (id) => setPersonaAbierta((actual) => (actual === id ? null : id));
  const alternarDia = (dia) => setDiaSeleccionado((actual) => (actual === dia ? null : dia));

  const descargarCsv = () => {
    const filas = [
      ["Fecha", "Persona", "Modalidad"],
      ...[...asistenciasDelMes]
        .sort((a, b) => a.dia - b.dia || compararNombres(a.usuario, b.usuario))
        .map((r) => [
          `${r.anio}-${dosDigitos(r.mes + 1)}-${dosDigitos(r.dia)}`,
          r.usuario,
          r.modalidad === "CASA" ? "Casa" : "Oficina",
        ]),
    ];
    const csv = `\ufeff${filas.map((fila) => fila.map(celdaCsv).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `asistencias-${anio}-${dosDigitos(mes + 1)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  // ---------- Render ----------
  return (
    <div className="dashboard">
      <style>{estilos}</style>

      <header className="dashboard__encabezado">
        <div className="dashboard__identidad">
          <h1 className="dashboard__titulo">Panel de control</h1>
          <p className="dashboard__subtitulo">
            {fechaHoy}
            {actualizando && listo && <span className="dashboard__actualizando" role="status">Actualizando…</span>}
          </p>
        </div>

        <div className="dashboard__controles">
          <button
            type="button"
            className="boton boton--icono"
            onClick={() => cambiarMes(-1)}
            aria-label="Mes anterior"
          >
            ‹
          </button>

          <label className="campo">
            <span>Mes</span>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i}>{nombre}</option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Año</span>
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {opcionesAnio.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="boton boton--icono"
            onClick={() => cambiarMes(1)}
            aria-label="Mes siguiente"
          >
            ›
          </button>

          <button type="button" className="boton" onClick={irAHoy} disabled={esMesActual}>
            Hoy
          </button>
          <button
            type="button"
            className="boton"
            onClick={descargarCsv}
            disabled={total === 0}
            title="Descargar las asistencias del mes en CSV"
          >
            Descargar CSV
          </button>
        </div>
      </header>

      {esLider && (
        <section className="operacion" aria-labelledby="titulo-operacion">
          <h2 id="titulo-operacion" className="operacion__titulo">Hoy</h2>
          {errorLider && <p className="operacion__error" role="alert">{errorLider}</p>}
          {panelLider && (
            <>
              <span className="operacion__dato"><strong>{panelLider.total}</strong> asignaciones</span>
              <span className="operacion__dato operacion__dato--casa"><strong>{panelLider.casa}</strong> en casa</span>
              <span className="operacion__dato operacion__dato--oficina"><strong>{panelLider.oficina}</strong> en oficina</span>
              <span className="operacion__dato"><strong>{panelLider.pendientes}</strong> solicitudes</span>
            </>
          )}
          <nav className="operacion__acciones" aria-label="Acciones de operación">
            <Link to="/solicitudes">Solicitudes</Link>
            <Link to="/asistencias">Asistencias</Link>
            <Link to="/reemplazos">Reemplazos</Link>
          </nav>
        </section>
      )}

      {!listo && !error && <p className="estado" role="status">Cargando datos…</p>}

      {error && (
        <div className="estado estado--error" role="alert">
          <span>{error}</span>
          <button type="button" className="boton" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {listo && (
        <>
          <section className="resumen" aria-label="Resumen del periodo">
            {estadisticas.map(({ etiqueta, valor, icono, nota }, indice) => (
              <div className={`resumen__item resumen__item--${indice + 1}`} key={etiqueta}>
                <Icono nombre={icono} className="resumen__icono" />
                <span className="resumen__valor">{valor}</span>
                <span className="resumen__etiqueta">{etiqueta}</span>
                {nota && <small className="resumen__nota">{nota}</small>}
              </div>
            ))}
          </section>

          <section className="alertas" aria-label="Puntos de atención">
            <span className="alertas__titulo">Atención</span>
            {alertas.length > 0 ? (
              alertas.map(({ clave, tono, texto, titulo, accion }) =>
                accion ? (
                  <button
                    type="button"
                    className={`alerta alerta--${tono} alerta--accion`}
                    key={clave}
                    title={titulo}
                    onClick={accion}
                  >
                    {texto}
                  </button>
                ) : (
                  <span className={`alerta alerta--${tono}`} key={clave} title={titulo}>{texto}</span>
                )
              )
            ) : (
              <span className="alerta alerta--ok">Sin pendientes en {MESES[mes]}</span>
            )}
          </section>

          <div className="dashboard__cuerpo">
            <section className="panel panel--personas" aria-labelledby="titulo-usuarios">
              <div className="personas__encabezado">
                <div>
                  <h2 id="titulo-usuarios" className="panel__titulo">Por persona</h2>
                  <p className="personas__meta">
                    {porUsuario.length} {porUsuario.length === 1 ? "persona" : "personas"} con {total} asistencias en {MESES[mes].toLowerCase()}
                    {promedioPorPersona > 0 && `, promedio de ${promedioPorPersona} días`}
                  </p>
                </div>
                {sinAsignacion > 0 && (
                  <button
                    type="button"
                    className="personas__alerta"
                    title="Usuarios activos sin ninguna asignación en el periodo"
                    aria-expanded={verSinAsignar}
                    onClick={() => setVerSinAsignar((v) => !v)}
                  >
                    {sinAsignacion} sin asignación
                  </button>
                )}
              </div>

              {verSinAsignar && sinAsignacion > 0 && (
                <p className="sin-asignar">
                  <strong>Sin asignación:</strong> {nombresSinAsignar.join(", ")}
                </p>
              )}

              {porUsuario.length > 0 && (
                <div className="personas__herramientas">
                  <input
                    type="search"
                    className="personas__buscar"
                    placeholder="Buscar persona"
                    aria-label="Buscar persona"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                  <FiltroPersonas
                    id="filtro-lista"
                    opciones={opcionesPersonas}
                    seleccion={personasSel}
                    onChange={setPersonasSel}
                  />
                  <div className="segmentos" role="group" aria-label="Filtrar por modalidad">
                    {FILTROS.map(({ valor, etiqueta }) => (
                      <button
                        type="button"
                        key={valor}
                        className={`segmento${filtro === valor ? " segmento--activo" : ""}`}
                        aria-pressed={filtro === valor}
                        onClick={() => setFiltro(valor)}
                      >
                        {etiqueta}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {personasFiltradas.length > 0 ? (
                <ul className="personas">
                  {personasFiltradas.map((p) => {
                    const enCasa = formatearPorcentaje(p.casa, p.total);
                    const enOficina = formatearPorcentaje(p.oficina, p.total);
                    const volumen = maximoDiasPorPersona > 0
                      ? (p.total / maximoDiasPorPersona) * 100
                      : 0;
                    const abierta = personaAbierta === p.id;
                    const idDetalle = `detalle-${p.id}`;
                    const etiquetaModalidad = p.oficina === 0 ? "Solo casa" : p.casa === 0 ? "Solo oficina" : null;

                    return (
                      <li className={`persona${abierta ? " persona--abierta" : ""}`} key={p.id}>
                        <button
                          type="button"
                          className="persona__boton"
                          onClick={() => alternarPersona(p.id)}
                          aria-expanded={abierta}
                          aria-controls={idDetalle}
                        >
                          <span className="persona__avatar" aria-hidden="true">{iniciales(p.nombre)}</span>
                          <span className="persona__detalle">
                            <span className="persona__fila">
                              <span className="persona__nombre" title={p.nombre}>{p.nombre}</span>
                              <span className="persona__total">
                                {p.total} {p.total === 1 ? "día" : "días"}
                              </span>
                            </span>
                            <span
                              className="barra barra--delgada"
                              role="img"
                              aria-label={`${p.nombre}: ${p.casa} días en casa y ${p.oficina} en oficina`}
                            >
                              <span className="barra__relleno" style={{ width: `${volumen}%` }}>
                                <span className="barra__tramo barra__tramo--casa" style={{ width: `${enCasa}%` }} />
                                <span className="barra__tramo barra__tramo--oficina" style={{ width: `${enOficina}%` }} />
                              </span>
                            </span>
                            <span className="persona__cifras">
                              <span className="persona__cifra">
                                <span className="persona__punto persona__punto--casa" aria-hidden="true" />
                                {p.casa} casa
                              </span>
                              <span className="persona__cifra">
                                <span className="persona__punto persona__punto--oficina" aria-hidden="true" />
                                {p.oficina} oficina
                              </span>
                              {etiquetaModalidad && <span className="persona__etiqueta">{etiquetaModalidad}</span>}
                            </span>
                          </span>
                          <span className={`persona__flecha${abierta ? " persona__flecha--abierta" : ""}`} aria-hidden="true" />
                        </button>

                        {abierta && (
                          <div className="persona__dias" id={idDetalle}>
                            {[
                              { modalidad: "CASA", etiqueta: "Días en casa", total: p.casa, clase: "casa" },
                              { modalidad: "OFICINA", etiqueta: "Días en oficina", total: p.oficina, clase: "oficina" },
                            ].map(({ modalidad, etiqueta, total: cantidad, clase }) => {
                              const dias = p.dias.filter((d) => d.modalidad === modalidad);
                              return (
                                <div className="persona__grupo" key={modalidad}>
                                  <p className="persona__grupo-titulo">
                                    <span className={`persona__punto persona__punto--${clase}`} aria-hidden="true" />
                                    {etiqueta} ({cantidad})
                                  </p>
                                  {dias.length > 0 ? (
                                    <ul className="chips">
                                      {dias.map(({ dia }) => (
                                        <li
                                          className={`chip chip--${clase}`}
                                          key={`${modalidad}-${dia}`}
                                          title={`${dia} de ${MESES[mes]} de ${anio}, ${diaSemana(dia)}`}
                                        >
                                          {dia}
                                          <small>{diaSemana(dia)}</small>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="persona__grupo-vacio">Sin días en esta modalidad.</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="vacio">
                  {porUsuario.length > 0
                    ? "Ninguna persona coincide con el filtro."
                    : "No hay asistencias por persona en este periodo. Genera el cronograma del mes para verlas aquí."}
                </p>
              )}
            </section>

            <div className="dashboard__lado">
              <div className="lado__fila">
                <section className="panel panel--compacto panel--grafico" aria-labelledby="titulo-distribucion">
                  <h2 id="titulo-distribucion" className="panel__titulo">Modalidad del mes</h2>
                  {total > 0 ? (
                    <div className="dona">
                      <div className="dona__lienzo">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distribucion}
                              dataKey="total"
                              nameKey="nombre"
                              innerRadius="66%"
                              outerRadius="94%"
                              paddingAngle={4}
                              stroke="none"
                            >
                              {distribucion.map((segmento) => (
                                <Cell key={segmento.nombre} fill={segmento.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={ESTILO_TOOLTIP} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="dona__centro">
                          <strong>{total}</strong>
                          <span>asistencias</span>
                        </div>
                      </div>
                      <ul className="leyenda">
                        <li><span className="muestra muestra--casa" /> Casa {casa} ({porcentajeCasa}%)</li>
                        <li><span className="muestra muestra--oficina" /> Oficina {oficina} ({porcentajeOficina}%)</li>
                      </ul>
                    </div>
                  ) : <p className="vacio">Sin asistencias este mes.</p>}
                </section>

                <section className="panel panel--compacto panel--grafico" aria-labelledby="titulo-semanal">
                  <h2 id="titulo-semanal" className="panel__titulo">Por día de la semana</h2>
                  {total > 0 ? (
                    <div className="grafico__lienzo">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={distribucionSemanal} margin={{ top: 4, right: 4, left: -26, bottom: -6 }}>
                          <CartesianGrid stroke="rgba(255,255,255,.09)" vertical={false} />
                          <XAxis dataKey="dia" tick={EJE} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={EJE} axisLine={false} tickLine={false} width={34} />
                          <Tooltip contentStyle={ESTILO_TOOLTIP} cursor={{ fill: "rgba(255,255,255,.05)" }} />
                          <Bar dataKey="casa" name="Casa" stackId="a" fill={COLOR_CASA} />
                          <Bar dataKey="oficina" name="Oficina" stackId="a" fill={COLOR_OFICINA} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="vacio">Sin datos para mostrar.</p>}
                </section>
              </div>

              <section className="panel" aria-labelledby="titulo-calendario">
                <div className="calendario__encabezado">
                  <h2 id="titulo-calendario" className="panel__titulo">
                    Actividad de {MESES[mes].toLowerCase()} {anio}
                  </h2>
                  <FiltroPersonas
                    id="filtro-calendario"
                    opciones={opcionesPersonas}
                    seleccion={personasSel}
                    onChange={setPersonasSel}
                  />
                  <ul className="leyenda leyenda--fila" aria-label="Leyenda del calendario">
                    <li><span className="muestra muestra--casa" /> Casa</li>
                    <li><span className="muestra muestra--oficina" /> Oficina</li>
                    <li><span className="muestra muestra--hoy" /> Hoy</li>
                    <li><span className="muestra muestra--festivo" /> Festivo</li>
                  </ul>
                </div>

                <div className="calendario">
                  <div>
                    <div className="calendario__rejilla" role="group" aria-label={`Actividad de ${MESES[mes]} ${anio}`}>
                      {DIAS.map((dia) => <span className="calendario__dia-semana" key={dia}>{dia}</span>)}
                      {calendarioMes.map((celda) => {
                        if (celda.vacio) return <span className="dia dia--vacio" key={celda.clave} aria-hidden="true" />;
                        const activo = diaActivo === celda.dia;
                        const pctCasa = celda.total ? (celda.casa / celda.total) * 100 : 0;
                        const pctOficina = celda.total ? 100 - pctCasa : 0;
                        const clases = [
                          "dia",
                          celda.finDeSemana ? "dia--finde" : "",
                          celda.festivo ? "dia--festivo" : "",
                          celda.esHoy ? "dia--hoy" : "",
                          activo ? "dia--activo" : "",
                        ].filter(Boolean).join(" ");
                        const resumenDia = `${celda.casa} en casa, ${celda.oficina} en oficina`;
                        return (
                          <button
                            type="button"
                            className={clases}
                            key={celda.clave}
                            onClick={() => alternarDia(celda.dia)}
                            aria-pressed={activo}
                            aria-label={`${celda.dia} de ${MESES[mes]}${celda.festivo ? `, festivo: ${celda.festivo}` : ""}: ${resumenDia}`}
                            title={`${diaSemana(celda.dia)} ${celda.dia}${celda.festivo ? `, ${celda.festivo}` : ""}: ${resumenDia}`}
                            style={celda.total ? { backgroundColor: `rgba(94, 234, 212, ${celda.intensidad})` } : undefined}
                          >
                            <span className="dia__numero">{celda.dia}</span>
                            {celda.total > 0 && (
                              <span className="dia__conteo">
                                <span className="dia__c dia__c--casa">{celda.casa}</span>
                                <span className="dia__c dia__c--oficina">{celda.oficina}</span>
                              </span>
                            )}
                            <span className="dia__mezcla" aria-hidden="true">
                              <i className="dia__tramo dia__tramo--casa" style={{ width: `${pctCasa}%` }} />
                              <i className="dia__tramo dia__tramo--oficina" style={{ width: `${pctOficina}%` }} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="calendario__nota">
                      {hayFiltroPersonas && "Solo se muestran las personas elegidas. "}
                      {diaPicoVista
                        ? `Día con más actividad: ${diaPicoVista.dia} de ${MESES[mes]} (${diaPicoVista.cantidad}). ${diasConRegistroVista} ${diasConRegistroVista === 1 ? "día" : "días"} con registros.`
                        : "Sin registros en el periodo."}
                    </p>
                  </div>

                  <aside className="detalle-dia" aria-live="polite" aria-label="Detalle del día">
                    {diaActivo ? (
                      <>
                        <div>
                          <p className="detalle-dia__titulo">
                            {diaSemana(diaActivo)} {diaActivo} de {MESES[mes]}
                            {esMesActual && diaActivo === hoyDia && <span className="etiqueta">Hoy</span>}
                          </p>
                          <p className="detalle-dia__meta">
                            {festivoActivo ? `Festivo: ${festivoActivo}. ` : ""}
                            {casaActiva + oficinaActiva} {casaActiva + oficinaActiva === 1 ? "asignación" : "asignaciones"}
                            {hayFiltroPersonas ? " de las personas elegidas" : ""}
                          </p>
                        </div>

                        {detalleActivo ? (
                          [
                            { clase: "oficina", etiqueta: "En oficina", nombres: detalleActivo.oficina },
                            { clase: "casa", etiqueta: "En casa", nombres: detalleActivo.casa },
                          ].map(({ clase, etiqueta, nombres }) => (
                            <div className="detalle-dia__grupo" key={clase}>
                              <p className="persona__grupo-titulo">
                                <span className={`persona__punto persona__punto--${clase}`} aria-hidden="true" />
                                {etiqueta} ({nombres.length})
                              </p>
                              {nombres.length > 0 ? (
                                <ul className="nombres">
                                  {nombres.map((nombre) => (
                                    <li className="nombres__item" key={`${clase}-${nombre}`}>
                                      <span className="nombres__avatar" aria-hidden="true">{iniciales(nombre)}</span>
                                      <span className="nombres__texto" title={nombre}>{nombre}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="persona__grupo-vacio">Nadie en esta modalidad.</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="vacio">
                            {festivoActivo
                              ? "Día festivo, sin asignaciones."
                              : esFinDeSemana(anio, mes, diaActivo)
                                ? "Fin de semana, sin asignaciones."
                                : hayFiltroPersonas
                                  ? "Ninguna de las personas elegidas tiene asignación este día."
                                  : "Este día no tiene asignaciones. Puede ser un cierre de oficina o falta programar."}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="vacio">Selecciona un día para ver quién está en casa y quién en oficina.</p>
                    )}
                  </aside>
                </div>
              </section>

              <section className="panel panel--compacto panel--grafico panel--ancho" aria-labelledby="titulo-tendencia">
                <h2 id="titulo-tendencia" className="panel__titulo">Tendencia {anio}</h2>
                {tendenciaAnual.some((dato) => dato.casa + dato.oficina > 0) ? (
                  <div className="grafico__lienzo">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={tendenciaAnual} margin={{ top: 4, right: 4, left: -26, bottom: -6 }}>
                        <defs>
                          <linearGradient id="relleno-casa" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLOR_CASA} stopOpacity={0.38} />
                            <stop offset="95%" stopColor={COLOR_CASA} stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="relleno-oficina" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={COLOR_OFICINA} stopOpacity={0.32} />
                            <stop offset="95%" stopColor={COLOR_OFICINA} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,.09)" vertical={false} />
                        <XAxis dataKey="mes" tick={EJE} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={EJE} axisLine={false} tickLine={false} width={34} />
                        <Tooltip contentStyle={ESTILO_TOOLTIP} />
                        <Area type="monotone" dataKey="casa" name="Casa" stroke={COLOR_CASA} fill="url(#relleno-casa)" strokeWidth={2} />
                        <Area type="monotone" dataKey="oficina" name="Oficina" stroke={COLOR_OFICINA} fill="url(#relleno-oficina)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="vacio">Aún no hay asistencias en {anio}.</p>}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const estilos = `
.dashboard {
  --tinta: #f8fafc;
  --tinta-suave: #b8c1d9;
  --linea: rgba(255, 255, 255, 0.12);
  --superficie: rgba(255, 255, 255, 0.045);
  --superficie-hover: rgba(255, 255, 255, 0.075);
  --casa: ${COLOR_CASA};
  --oficina: ${COLOR_OFICINA};
  --aviso: #fde68a;
  --enfoque: #5eead4;
  --radio: 12px;
  --radio-chico: 8px;

  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px clamp(14px, 2vw, 26px) 22px;
  box-sizing: border-box;
  font-family: var(--sans);
  color: var(--tinta);
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
  background: linear-gradient(180deg, #050816 0%, #0b1120 100%);
  background-attachment: local;
}
.dashboard > * { flex-shrink: 0; }
.dashboard button { font-family: inherit; }
.dashboard :focus-visible { outline: 2px solid var(--enfoque); outline-offset: 2px; }

/* ---------- Encabezado ---------- */
.dashboard__encabezado { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; }
.dashboard__identidad { min-width: 0; }
.dashboard__titulo { margin: 0; font-size: clamp(1.2rem, 1.8vw, 1.55rem); font-weight: 700; letter-spacing: -0.03em; color: #fff; }
.dashboard__subtitulo { display: flex; align-items: center; gap: 10px; margin: 2px 0 0; color: var(--tinta-suave); font-size: 0.78rem; text-transform: capitalize; }
.dashboard__actualizando { color: var(--enfoque); font-size: 0.7rem; text-transform: none; }

.dashboard__controles {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}
.campo { display: flex; flex-direction: column; gap: 3px; font-size: 0.66rem; font-weight: 600; color: var(--tinta-suave); }
.campo select {
  min-width: 108px;
  height: 34px;
  padding: 0 9px;
  font: inherit;
  font-size: 0.82rem;
  color: var(--tinta);
  background: var(--superficie-hover);
  border: 1px solid var(--linea);
  border-radius: var(--radio-chico);
}
.campo select option { color: #0f172a; background: #fff; }

.boton {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--linea);
  border-radius: var(--radio-chico);
  color: var(--tinta);
  background: var(--superficie-hover);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.boton:hover:not(:disabled) { border-color: rgba(255, 255, 255, 0.34); background: rgba(255, 255, 255, 0.11); }
.boton:disabled { opacity: 0.45; cursor: default; }
.boton--icono { width: 34px; padding: 0; font-size: 1.15rem; line-height: 1; }

/* ---------- Franja de operación (líderes) ---------- */
.operacion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  background: var(--superficie);
}
.operacion__titulo { margin: 0 4px 0 0; color: #fff; font-size: 0.82rem; font-weight: 700; }
.operacion__dato { padding: 3px 9px; border-radius: 7px; color: #cbd5e1; background: rgba(255, 255, 255, 0.07); font-size: 0.78rem; }
.operacion__dato strong { color: #fff; }
.operacion__dato--casa strong { color: var(--casa); }
.operacion__dato--oficina strong { color: var(--oficina); }
.operacion__error { margin: 0; color: #fecaca; font-size: 0.78rem; }
.operacion__acciones { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.operacion__acciones a {
  padding: 5px 11px;
  border: 1px solid var(--linea);
  border-radius: var(--radio-chico);
  color: #e2e8f0;
  background: var(--superficie-hover);
  font-size: 0.78rem;
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.operacion__acciones a:hover { border-color: rgba(94, 234, 212, 0.55); }

/* ---------- Superficies ---------- */
.estado {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 14px 18px;
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  background: var(--superficie);
  color: var(--tinta-suave);
}
.estado--error { color: #fecaca; background: rgba(127, 29, 29, 0.28); border-color: rgba(252, 165, 165, 0.3); }

.panel { position: relative; margin: 0; min-width: 0; padding: 12px 14px; border: 1px solid var(--linea); border-radius: var(--radio); background: var(--superficie); }
.panel__titulo { margin: 0 0 8px; font-size: 0.9rem; font-weight: 650; color: var(--tinta); }
.vacio { margin: 0; color: var(--tinta-suave); font-size: 0.8rem; line-height: 1.45; }

/* ---------- Resumen ---------- */
.resumen {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  background: var(--superficie);
}
.resumen__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 13px;
  border-right: 1px solid rgba(255, 255, 255, 0.09);
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
  box-sizing: border-box;
}
.resumen__item:nth-child(4n) { border-right: 0; }
.resumen__item:nth-child(n + 5) { border-bottom: 0; }
.resumen__valor { font-size: clamp(1.2rem, 1.7vw, 1.5rem); font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; color: var(--tinta); }
.resumen__item--4 .resumen__valor { color: var(--casa); }
.resumen__item--5 .resumen__valor { color: var(--oficina); }
.resumen__etiqueta { font-size: 0.72rem; color: var(--tinta-suave); }
.resumen__nota { min-height: 0.85rem; color: rgba(184, 193, 217, 0.85); font-size: 0.66rem; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.resumen__icono { width: 15px; height: 15px; color: #cbd5e1; }

@media (min-width: 1500px) {
  .resumen { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .resumen__item { border-bottom: 0; }
  .resumen__item:nth-child(4n) { border-right: 1px solid rgba(255, 255, 255, 0.09); }
  .resumen__item:nth-child(8n) { border-right: 0; }
}

/* ---------- Alertas ---------- */
.alertas { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.alertas__titulo { margin-right: 4px; color: var(--tinta-suave); font-size: 0.74rem; font-weight: 700; }
.alerta { padding: 5px 12px; border: 1px solid transparent; border-radius: 999px; font-size: 0.74rem; font-weight: 600; }
.alerta--aviso { color: var(--aviso); background: rgba(120, 53, 15, 0.28); border-color: rgba(251, 191, 36, 0.35); }
.alerta--info { color: #cfe4ff; background: rgba(30, 64, 175, 0.22); border-color: rgba(147, 197, 253, 0.3); }
.alerta--ok { color: #b8fff4; background: rgba(15, 118, 110, 0.24); border-color: rgba(94, 234, 212, 0.3); }
.alerta--accion { cursor: pointer; transition: filter 0.15s ease; }
.alerta--accion:hover { filter: brightness(1.2); }

/* ---------- Cuerpo ---------- */
.dashboard__cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 12px; align-items: start; }

.panel--personas { display: flex; flex-direction: column; position: sticky; top: 0; z-index: 2; max-height: calc(100dvh - 32px); }

.personas__encabezado { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 6px 12px; margin-bottom: 8px; }
.personas__encabezado .panel__titulo { margin-bottom: 2px; }
.personas__meta { margin: 0; color: var(--tinta-suave); font-size: 0.74rem; line-height: 1.4; }
.personas__alerta {
  padding: 4px 10px;
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 999px;
  color: var(--aviso);
  background: rgba(120, 53, 15, 0.28);
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.sin-asignar { margin: 0 0 8px; padding: 8px 11px; border: 1px solid rgba(251, 191, 36, 0.25); border-radius: var(--radio-chico); color: var(--aviso); background: rgba(120, 53, 15, 0.18); font-size: 0.74rem; line-height: 1.5; }
.sin-asignar strong { color: #fef3c7; }

.personas__herramientas { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-bottom: 8px; }
.personas__buscar {
  flex: 1 1 140px;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--linea);
  border-radius: var(--radio-chico);
  color: var(--tinta);
  background: var(--superficie-hover);
  font: inherit;
  font-size: 0.78rem;
}
.personas__buscar::placeholder { color: rgba(184, 193, 217, 0.7); }
.segmentos { display: flex; flex-wrap: wrap; gap: 4px; }
.segmento {
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--linea);
  border-radius: 999px;
  color: var(--tinta-suave);
  background: transparent;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.segmento:hover { color: var(--tinta); border-color: rgba(255, 255, 255, 0.3); }
.segmento--activo { color: #04231f; background: var(--casa); border-color: transparent; }

.personas {
  list-style: none;
  margin: 0;
  padding: 0 4px 0 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  align-content: start;
  gap: 7px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
}

.persona { border: 1px solid rgba(255, 255, 255, 0.09); border-radius: var(--radio); background: rgba(255, 255, 255, 0.03); transition: border-color 0.15s ease, background 0.15s ease; }
.persona:hover { border-color: rgba(255, 255, 255, 0.2); background: var(--superficie-hover); }
.persona--abierta { border-color: rgba(94, 234, 212, 0.42); background: rgba(94, 234, 212, 0.06); grid-column: 1 / -1; }

.persona__boton { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: 0; border-radius: var(--radio); background: none; color: inherit; text-align: left; cursor: pointer; }
.persona__avatar, .nombres__avatar { display: grid; flex: 0 0 auto; place-items: center; color: #04231f; background: linear-gradient(135deg, var(--casa), var(--oficina)); font-weight: 800; }
.persona__avatar { width: 30px; height: 30px; border-radius: 9px; font-size: 0.66rem; letter-spacing: 0.03em; }
.persona__detalle { display: grid; flex: 1 1 auto; gap: 4px; min-width: 0; }
.persona__fila { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.persona__nombre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.84rem; font-weight: 600; color: #f1f5f9; }
.persona__total { flex: 0 0 auto; color: #e2e8f0; font-size: 0.72rem; font-variant-numeric: tabular-nums; }
.persona__cifras { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; color: var(--tinta-suave); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
.persona__cifra { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.persona__etiqueta { padding: 0 7px; border-radius: 999px; color: var(--aviso); background: rgba(120, 53, 15, 0.3); font-size: 0.64rem; font-weight: 700; }
.persona__punto { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.persona__punto--casa { background: var(--casa); }
.persona__punto--oficina { background: var(--oficina); }

.persona__flecha { flex: 0 0 auto; width: 7px; height: 7px; margin-right: 2px; border-right: 1.6px solid rgba(226, 232, 240, 0.75); border-bottom: 1.6px solid rgba(226, 232, 240, 0.75); transform: rotate(45deg) translateY(-2px); transition: transform 0.2s ease; }
.persona__flecha--abierta { transform: rotate(225deg) translateY(-2px); }

.persona__dias { display: grid; gap: 8px; padding: 2px 10px 10px; margin: 0 0 2px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
.persona__grupo-titulo { display: flex; align-items: center; gap: 6px; margin: 8px 0 4px; font-size: 0.74rem; font-weight: 600; color: #e2e8f0; }
.persona__grupo-vacio { margin: 0; color: var(--tinta-suave); font-size: 0.72rem; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
.chip { display: inline-flex; align-items: baseline; gap: 3px; padding: 3px 8px; border-radius: 7px; font-size: 0.74rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.chip small { font-size: 0.6rem; font-weight: 600; opacity: 0.75; }
.chip--casa { color: #b8fff4; background: rgba(20, 184, 166, 0.22); border: 1px solid rgba(94, 234, 212, 0.34); }
.chip--oficina { color: #cfe4ff; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(147, 197, 253, 0.32); }

/* ---------- Barras ---------- */
.barra { display: flex; height: 18px; border-radius: 999px; overflow: hidden; background: rgba(255, 255, 255, 0.1); }
.barra--delgada { height: 7px; }
.barra__relleno { display: flex; height: 100%; border-radius: 999px; overflow: hidden; }
.barra__tramo { transition: width 0.35s ease; }
.barra__tramo--casa { background: #2dd4bf; }
.barra__tramo--oficina { background: #60a5fa; }

/* ---------- Columna derecha ---------- */
.dashboard__lado { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.lado__fila { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.panel--compacto { display: flex; flex-direction: column; min-height: 0; padding: 10px 12px; }
.panel--compacto .panel__titulo { font-size: 0.82rem; margin-bottom: 6px; }
.panel--grafico { height: 210px; }
.panel--ancho { height: 230px; }

.grafico__lienzo { flex: 1 1 auto; width: 100%; min-height: 0; }
.grafico__lienzo .recharts-wrapper { font-family: inherit; }
.grafico__lienzo .recharts-tooltip-item,
.grafico__lienzo .recharts-tooltip-label { color: #f8fafc !important; }

.dona { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-height: 0; }
.dona__lienzo { position: relative; flex: 1 1 auto; height: 100%; min-height: 60px; }
.dona__centro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.dona__centro strong { color: #fff; font-size: 1.1rem; line-height: 1; font-variant-numeric: tabular-nums; }
.dona__centro span { color: var(--tinta-suave); font-size: 0.62rem; }

.leyenda { display: grid; gap: 5px; list-style: none; margin: 0; padding: 0; font-size: 0.7rem; color: var(--tinta-suave); white-space: nowrap; }
.leyenda li { display: flex; align-items: center; gap: 5px; }
.leyenda--fila { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.muestra { width: 8px; height: 8px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
.muestra--casa { background: #2dd4bf; }
.muestra--oficina { background: #60a5fa; }
.muestra--hoy { background: transparent; box-shadow: 0 0 0 1.5px #fbbf24; }
.muestra--festivo { background: transparent; border: 1.5px dashed var(--aviso); }

/* ---------- Calendario de actividad ---------- */
.calendario__encabezado { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-bottom: 10px; }
.calendario__encabezado .panel__titulo { margin: 0; }

/* ---------- Filtro de personas ---------- */
.filtro { position: relative; }
.boton--filtro { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; max-width: 220px; height: 32px; padding: 0 10px; font-size: 0.76rem; }
.boton--activo { color: #04231f; background: var(--casa); border-color: transparent; }
.boton--activo:hover:not(:disabled) { background: #7ff1df; border-color: transparent; }
.filtro__etiqueta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filtro__flecha { flex: 0 0 auto; width: 6px; height: 6px; border-right: 1.6px solid currentColor; border-bottom: 1.6px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform 0.2s ease; }
.filtro__flecha--abierta { transform: rotate(225deg) translateY(-2px); }
.filtro__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: grid;
  gap: 8px;
  width: min(300px, calc(100vw - 32px));
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--radio);
  background: #111a2e;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
.filtro__panel .personas__buscar { flex: none; width: 100%; box-sizing: border-box; }
.filtro__acciones { display: flex; justify-content: space-between; gap: 8px; }
.filtro__enlace { padding: 2px 0; border: 0; background: none; color: var(--casa); font-size: 0.72rem; font-weight: 600; cursor: pointer; }
.filtro__enlace:hover:not(:disabled) { text-decoration: underline; }
.filtro__enlace:disabled { color: var(--tinta-suave); opacity: 0.5; cursor: default; }
.filtro__lista { display: grid; gap: 2px; max-height: 260px; margin: 0; padding: 0; overflow-y: auto; list-style: none; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
.filtro__opcion { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 3px 6px; border-radius: var(--radio-chico); cursor: pointer; }
.filtro__opcion:hover { background: var(--superficie-hover); }
.filtro__opcion input { width: 16px; height: 16px; margin: 0; accent-color: #2dd4bf; cursor: pointer; }
.calendario { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; align-items: start; }

.calendario__rejilla { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.calendario__dia-semana { padding-bottom: 2px; color: var(--tinta-suave); font-size: 0.66rem; font-weight: 600; text-align: center; }

.dia {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 3px;
  min-width: 0;
  min-height: 52px;
  padding: 5px 6px 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radio-chico);
  color: var(--tinta);
  background: rgba(255, 255, 255, 0.04);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease;
}
.dia:hover { border-color: rgba(255, 255, 255, 0.32); }
.dia--vacio { border-color: transparent; background: transparent; cursor: default; pointer-events: none; }
.dia--finde { opacity: 0.5; }
.dia--festivo { border: 1px dashed rgba(253, 230, 138, 0.6); }
.dia--festivo .dia__numero { color: var(--aviso); }
.dia--hoy { box-shadow: 0 0 0 1.5px #fbbf24; }
.dia--activo { border-color: var(--casa); box-shadow: 0 0 0 1px var(--casa); opacity: 1; }
.dia--hoy.dia--activo { box-shadow: 0 0 0 1.5px #fbbf24, 0 0 0 3px rgba(94, 234, 212, 0.55); }
.dia__numero { font-size: 0.76rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.dia__conteo { display: flex; gap: 6px; font-size: 0.68rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.dia__c--casa { color: var(--casa); }
.dia__c--oficina { color: var(--oficina); }
.dia__mezcla { display: flex; height: 3px; overflow: hidden; border-radius: 99px; background: rgba(255, 255, 255, 0.08); }
.dia__tramo { display: block; height: 100%; }
.dia__tramo--casa { background: #2dd4bf; }
.dia__tramo--oficina { background: #60a5fa; }

.calendario__nota { margin: 8px 0 0; color: var(--tinta-suave); font-size: 0.7rem; line-height: 1.45; }

.detalle-dia { display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; padding: 11px 12px; border: 1px solid var(--linea); border-radius: var(--radio); background: rgba(255, 255, 255, 0.03); scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
.detalle-dia__titulo { display: flex; align-items: center; gap: 8px; margin: 0; color: #fff; font-size: 0.88rem; font-weight: 650; text-transform: capitalize; }
.detalle-dia__meta { margin: 2px 0 0; color: var(--tinta-suave); font-size: 0.72rem; }
.detalle-dia__grupo .persona__grupo-titulo { margin-top: 4px; }
.etiqueta { padding: 1px 8px; border-radius: 999px; color: #451a03; background: #fbbf24; font-size: 0.62rem; font-weight: 800; text-transform: none; }

.nombres { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.nombres__item { display: flex; align-items: center; gap: 7px; min-width: 0; }
.nombres__avatar { width: 20px; height: 20px; border-radius: 6px; font-size: 0.55rem; }
.nombres__texto { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #e2e8f0; font-size: 0.78rem; }

/* ---------- Adaptación ---------- */
@media (max-width: 1280px) {
  .calendario { grid-template-columns: minmax(0, 1fr); }
  .detalle-dia { max-height: none; }
}

@media (max-width: 1024px) {
  .dashboard { height: auto; min-height: 100dvh; overflow: visible; }
  .dashboard__cuerpo { grid-template-columns: minmax(0, 1fr); }
  .panel--personas { position: static; max-height: none; }
  .personas { max-height: 520px; }
}

@media (max-width: 720px) {
  .dashboard { padding: 14px 12px 20px; gap: 10px; }
  .dashboard__controles { width: 100%; }
  .campo { flex: 1 1 90px; }
  .campo select { width: 100%; min-width: 0; }
  .resumen { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .resumen__item { border-bottom: 1px solid rgba(255, 255, 255, 0.09); }
  .resumen__item:nth-child(4n) { border-right: 1px solid rgba(255, 255, 255, 0.09); }
  .resumen__item:nth-child(2n) { border-right: 0; }
  .resumen__item:nth-child(n + 7) { border-bottom: 0; }
  .personas { grid-template-columns: minmax(0, 1fr); }
  .lado__fila { grid-template-columns: minmax(0, 1fr); }
  .dia { min-height: 44px; padding: 4px; }
  .dia__conteo { gap: 4px; font-size: 0.62rem; }
  .operacion__acciones { margin-left: 0; width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .persona, .persona__flecha, .filtro__flecha, .barra__tramo, .operacion__acciones a, .dia, .segmento, .boton, .alerta--accion { transition: none; }
}
`;

export default Dashboard;