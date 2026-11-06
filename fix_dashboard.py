with open(r'C:\\Users\\cristian.caro\\ControlAsistencia\\frontend\\src\\pages\\Dashboard.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line after the operacion section ends
new_block = [
    '\\n',
    '      {esLider && listo && (\\n',
    '        <section className=\
panel
panel--compacto\ aria-labelledby=\titulo-acciones\>\\n',
    '          <h2 id=\titulo-acciones\ className=\panel__titulo\>Acciones rÃ¡pidas</h2>\\n',
    '          <nav className=\operacion__acciones\ aria-label=\Acciones
rÃ¡pidas\>\\n',
    '            <Link to=\/generar-mes-v2\>Generar cronograma</Link>\\n',
    '            <Link to=\/asistencias\>Gestionar asistencias</Link>\\n',
    '            <Link to=\/solicitudes\>Revisar solicitudes</Link>\\n',
    '            <Link to=\/reemplazos\>Registrar reemplazo</Link>\\n',
    '            <Link to=\/festivos\>Gestionar festivos</Link>\\n',
    '            <Link to=\/cierres\>Cierres de oficina</Link>\\n',
    '          </nav>\\n',
    '        </section>\\n',
    '      )}\\n',
    '\\n',
]

# Insert after line 760 (index 760, which is the blank line after operacion section)
insert_idx = None
for i, line in enumerate(lines):
    if '        </section>\\n' in line and i > 750 and i < 765:
        insert_idx = i + 2
        break

if insert_idx is not None:
    result = lines[:insert_idx] + new_block + lines[insert_idx:]
    with open(r'C:\\Users\\cristian.caro\\ControlAsistencia\\frontend\\src\\pages\\Dashboard.jsx', 'w', encoding='utf-8') as f:
        f.writelines(result)
    print(f'Inserted at line {insert_idx}')
else:
    print('Could not find insertion point')
