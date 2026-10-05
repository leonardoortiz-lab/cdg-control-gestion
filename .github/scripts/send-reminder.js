// .github/scripts/send-reminder.js
// Corre directo en GitHub Actions — sin Vercel, sin restricciones SMTP

const nodemailer = require("nodemailer");

const SB_URL = "https://gmtcsaoiaeknpzoyljjm.supabase.co";
const SB_KEY = process.env.SB_KEY;

const DESTINATARIOS = [
  { uid: "leo", nombre: "Leonardo", email: "leonardo.ortiz@redsalud.cl" },
  { uid: "bas", nombre: "Bastián",  email: "bastian.retamal@redsalud.cl" },
  { uid: "iso", nombre: "Isidora",  email: "isidora.sepulvedaz@redsalud.cl" },
  { uid: "dan", nombre: "Daniela",  email: "daniela.riffo@redsalud.cl" },
  { uid: "joa", nombre: "Joaquín",  email: "joaquin.pena@redsalud.cl" },
  { uid: "edu", nombre: "Eduardo",  email: "eduardo.morales@redsalud.cl" },
  { uid: "mad", nombre: "Madai",    email: "madai.noriega@sanatorioaleman.cl" },
];

const USERS = {
  leo: "Leonardo Ortiz", bas: "Bastián Retamal", iso: "Isidora Sepúlveda",
  dan: "Daniela Riffo",  joa: "Joaquín Peña",    edu: "Eduardo Morales",
  mad: "Madai Noriega",
};

const USER_COLOR = {
  leo:"#1a2f63", bas:"#a3265c", iso:"#5b3f8c",
  dan:"#b9711b", joa:"#0e6e74", edu:"#2e6b3a", mad:"#7a4a2e",
};

const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

const TIPO_LABEL = {
  hito:"🔴 Hito crítico", cierre:"📊 Reunión de cierre", iceo:"📋 Revisión ICEO",
  precierre:"📅 Pre-cierre", close:"📂 Cierre ventas", capex:"💰 CAPEX",
  audit:"🔍 Auditoría", oferta:"🏥 Oferta médica", cuad:"⚖️ Cuadratura ICEO",
  rutina:"🔁 Rutina", birthday:"🎂 Cumpleaños", otro:"📌 Otro",
};

const TIPO_COLOR = {
  hito:"#8a2438", cierre:"#1d6b53", precierre:"#b9711b",
  iceo:"#1a2f63", audit:"#5b3f8c", default:"#1a2f63"
};

function getWeekRange(date) {
  const d = new Date(date);
  const dow = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + 1); mon.setHours(0,0,0,0);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4); fri.setHours(23,59,59,999);
  return { mon, fri };
}

function fmt(date) {
  const d = new Date(date);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()+1]}`;
}

function getResponsables(resp) {
  if(!resp || !Array.isArray(resp)) return "";
  return resp.map(id => USERS[id] || id).join(", ");
}

function getTasksInRange(tasks, from, to) {
  return tasks.filter(t => {
    if(!t.month || !t.day) return false;
    const taskDate = new Date(2026, t.month - 1, t.day);
    return taskDate >= from && taskDate <= to;
  });
}

// ── Matriz Urgencia × Importancia (igual a la vista "Matriz 2D" de Pendientes) ──
const ACTIVOS_STATUS = ["por iniciar","en ajuste","en proceso"];

function esc(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function buildMatrizHTML(pendientes) {
  const activos = pendientes.filter(p => ACTIVOS_STATUS.includes(p.status));
  const celdas = {};
  for(let u=1;u<=3;u++) for(let i=1;i<=3;i++) celdas[`${u}-${i}`] = [];
  activos.forEach(p => {
    const key = `${p.urgencia||2}-${p.importancia||2}`;
    if(celdas[key]) celdas[key].push(p);
  });
  const getBg = (u,i) => u*i >= 6 ? "#fff0f0" : u*i >= 4 ? "#fffbe6" : "#f0f8f0";
  const head = "text-align:center;font-family:monospace;font-weight:700;font-size:11px;color:#1a2f63;padding:6px 0;background:#f0f4ff;border-radius:6px;";

  let grid = `<div></div>` + [1,2,3].map(u => `<div style="${head}">U=${u}</div>`).join("");
  [3,2,1].forEach(i => {
    grid += `<div style="${head}display:flex;align-items:center;justify-content:center;">I=${i}</div>`;
    [1,2,3].forEach(u => {
      const items = celdas[`${u}-${i}`];
      const cards = items.length === 0
        ? `<div style="color:#ddd;font-size:9px;text-align:center;margin-top:8px;">—</div>`
        : items.map(p => {
            const resp = (Array.isArray(p.resp) ? p.resp : JSON.parse(p.resp||"[]"))
              .filter(uid => USERS[uid])
              .map(uid => `<span style="font-size:8.5px;color:${USER_COLOR[uid]||"#666"};font-weight:600;margin-right:3px;">${esc(USERS[uid].split(" ")[0])}</span>`)
              .join("");
            return `<div style="font-size:10px;background:white;border-radius:5px;padding:3px 6px;margin-bottom:3px;line-height:1.3;box-shadow:0 1px 3px rgba(0,0,0,.07);">
              <div style="font-weight:600;color:#272a33;">${esc(p.label)}</div>
              ${resp ? `<div style="margin-top:2px;">${resp}</div>` : ""}
            </div>`;
          }).join("");
      grid += `<div style="background:${getBg(u,i)};border-radius:8px;padding:6px;min-height:60px;border:1px solid #e8e5e0;">${cards}</div>`;
    });
  });

  const leyenda = [["#fff0f0","Alta prioridad (U×I ≥ 6)"],["#fffbe6","Media prioridad"],["#f0f8f0","Baja prioridad"]]
    .map(([bg,label]) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:#666;margin:0 6px;">
      <span style="width:12px;height:12px;border-radius:3px;background:${bg};border:1px solid #ddd;display:inline-block;"></span>${label}</span>`)
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;background:white;font-family:'Segoe UI',Arial,sans-serif;">
  <div id="matriz" style="width:560px;padding:16px;background:white;">
    <div style="font-size:11px;color:#aaa;margin-bottom:8px;text-align:center;">Urgencia (eje X) × Importancia (eje Y)</div>
    <div style="display:grid;grid-template-columns:60px 1fr 1fr 1fr;gap:4px;">${grid}</div>
    <div style="margin-top:10px;text-align:center;">${leyenda}</div>
  </div>
</body></html>`;
}

// Devuelve un PNG de la matriz, o null si no se pudo generar (el correo sale igual)
async function renderMatrizPNG(pendientes) {
  let browser;
  try {
    const puppeteer = require("puppeteer");
    browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 800, deviceScaleFactor: 2 });
    await page.setContent(buildMatrizHTML(pendientes), { waitUntil: "load" });
    const el = await page.$("#matriz");
    return await el.screenshot({ type: "png" });
  } catch(err) {
    console.error("⚠️ No se pudo generar la imagen de la matriz:", err.message);
    return null;
  } finally {
    if(browser) await browser.close();
  }
}

function buildEmail(thisWeekTasks, nextWeekHitos, thisWeek, nextWeek, conMatriz) {
  const weekLabel = `${fmt(thisWeek.mon)} – ${fmt(thisWeek.fri)}`;
  const nextLabel = `${fmt(nextWeek.mon)} – ${fmt(nextWeek.fri)}`;

  const myTasks = thisWeekTasks.filter(t => (t.tipo||t.type) !== "rutina");
  const byDay = {};
  myTasks.forEach(t => {
    const key = `${t.month}-${t.day}`;
    if(!byDay[key]) byDay[key] = { month: t.month, day: t.day, tasks: [] };
    byDay[key].tasks.push(t);
  });

  const sortedDays = Object.values(byDay).sort((a,b) => a.day - b.day || a.month - b.month);

  let diasHTML = sortedDays.length === 0
    ? `<p style="color:#888;font-style:italic;font-size:13px;">Sin actividades relevantes esta semana.</p>`
    : sortedDays.map(({month, day, tasks}) => {
        const date = new Date(2026, month-1, day);
        return `
          <div style="margin-bottom:14px;">
            <div style="font-weight:700;font-size:12px;color:#1a2f63;margin-bottom:6px;
              padding:5px 10px;background:#f0f4ff;border-radius:6px;display:inline-block;">
              ${fmt(date)}
            </div>
            ${tasks.map(t => {
              const tipo = t.tipo || t.type;
              const color = TIPO_COLOR[tipo] || TIPO_COLOR.default;
              const resp = getResponsables(Array.isArray(t.resp) ? t.resp : JSON.parse(t.resp||"[]"));
              return `<div style="padding:8px 12px;margin-bottom:4px;background:#fafaf8;
                border-radius:7px;border-left:3px solid ${color};">
                <div style="font-size:13px;color:#272a33;">${t.title}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">${TIPO_LABEL[tipo]||"📌"} · ${resp}</div>
              </div>`;
            }).join("")}
          </div>`;
      }).join("");

  let hitosHTML = nextWeekHitos.length === 0
    ? `<p style="color:#888;font-style:italic;font-size:13px;">Sin hitos críticos la próxima semana.</p>`
    : nextWeekHitos.sort((a,b) => a.day - b.day).map(t => {
        const date = new Date(2026, t.month-1, t.day);
        const resp = getResponsables(Array.isArray(t.resp) ? t.resp : JSON.parse(t.resp||"[]"));
        return `<div style="padding:10px 14px;margin-bottom:8px;background:#fff8f8;
          border-radius:8px;border-left:4px solid #8a2438;">
          <div style="font-size:11px;color:#8a2438;font-weight:700;margin-bottom:3px;">${fmt(date)}</div>
          <div style="font-weight:600;font-size:13px;color:#272a33;">${t.title}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">Responsable: ${resp}</div>
        </div>`;
      }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="background:#1a2f63;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">⛏️</div>
      <div style="color:white;font-weight:800;font-size:20px;">Control de Gestión</div>
      <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:4px;">Resumen semanal · ${weekLabel}</div>
    </div>
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;">
      <p style="color:#272a33;font-size:14px;margin:0 0 6px;">Hola equipo 👋</p>
      <p style="color:#666;font-size:13px;margin:0;">Aquí tienen el resumen de actividades de esta semana y los hitos críticos de la siguiente.</p>
    </div>
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;margin-top:2px;">
      <div style="margin-bottom:16px;">
        <span style="background:#1a2f63;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">📅 ESTA SEMANA</span>
        <span style="color:#888;font-size:12px;margin-left:10px;">${weekLabel}</span>
      </div>
      ${diasHTML}
    </div>
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;margin-top:2px;">
      <div style="margin-bottom:16px;">
        <span style="background:#8a2438;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">🔴 PRÓXIMA SEMANA</span>
        <span style="color:#888;font-size:12px;margin-left:10px;">${nextLabel}</span>
      </div>
      ${hitosHTML}
    </div>
    ${conMatriz ? `<div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;margin-top:2px;">
      <div style="margin-bottom:16px;">
        <span style="background:#5b3f8c;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">⚠️ PENDIENTES ESTRATÉGICOS</span>
        <span style="color:#888;font-size:12px;margin-left:10px;">Urgencia × Importancia</span>
      </div>
      <img src="cid:matriz" alt="Matriz de pendientes urgencia × importancia" style="width:100%;max-width:544px;height:auto;display:block;border-radius:8px;"/>
    </div>` : ""}
    <div style="background:#f0ede8;border-radius:0 0 12px 12px;padding:16px 28px;text-align:center;border:1px solid #e0ddd8;">
      <p style="color:#aaa;font-size:11px;margin:0;">
        Control de Gestión · Clínica RedSalud 2026<br/>
        <a href="https://cdg-control-gestion-cqoq.vercel.app" style="color:#1a2f63;font-weight:600;">Abrir la app →</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  // Obtener tareas de Supabase
  const res = await fetch(`${SB_URL}/rest/v1/tasks?order=day.asc`, {
    headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
  });
  const allTasks = await res.json();
  if(!Array.isArray(allTasks)) {
    console.error("Error Supabase:", JSON.stringify(allTasks));
    process.exit(1);
  }

  // Calcular semanas
  const now = new Date();
  const thisWeek = getWeekRange(now);
  const nextWeekStart = new Date(thisWeek.fri);
  nextWeekStart.setDate(nextWeekStart.getDate() + 3);
  const nextWeek = getWeekRange(nextWeekStart);

  const thisWeekTasks = getTasksInRange(allTasks, thisWeek.mon, thisWeek.fri);
  const nextWeekHitos = getTasksInRange(allTasks, nextWeek.mon, nextWeek.fri)
    .filter(t => ["hito","cierre","audit","precierre","iceo"].includes(t.tipo || t.type));

  // Pendientes para la imagen de la matriz
  let pendientes = [];
  try {
    const resP = await fetch(`${SB_URL}/rest/v1/pendientes?order=created_at.asc`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
    });
    const data = await resP.json();
    if(Array.isArray(data)) pendientes = data;
    else console.error("⚠️ Error Supabase pendientes:", JSON.stringify(data));
  } catch(err) {
    console.error("⚠️ No se pudieron leer los pendientes:", err.message);
  }
  const matrizPNG = await renderMatrizPNG(pendientes);

  const html = buildEmail(thisWeekTasks, nextWeekHitos, thisWeek, nextWeek, !!matrizPNG);

  // Configurar Gmail
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  // Enviar a todos
  const todos = DESTINATARIOS.map(d => d.email).join(", ");
  const info = await transporter.sendMail({
    from: `"Control de Gestión ⛏️" <${process.env.GMAIL_USER}>`,
    to: todos,
    subject: `⛏️ Resumen semanal CdG · ${new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit"})}`,
    html,
    attachments: matrizPNG
      ? [{ filename: "matriz-pendientes.png", content: matrizPNG, cid: "matriz" }]
      : [],
  });

  console.log("✅ Email enviado:", info.messageId);
  console.log(`📅 Tareas semana: ${thisWeekTasks.filter(t=>(t.tipo||t.type)!=="rutina").length}`);
  console.log(`🔴 Hitos próxima semana: ${nextWeekHitos.length}`);
  console.log(`⚠️ Pendientes activos en la matriz: ${pendientes.filter(p=>ACTIVOS_STATUS.includes(p.status)).length}${matrizPNG ? "" : " (sin imagen)"}`);
}

main().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
