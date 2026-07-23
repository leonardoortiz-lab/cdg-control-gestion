// api/weekly-reminder.js
// Envía resumen semanal usando Resend con BCC para todos los destinatarios

const SB_URL = "https://aemsibavanjertkiznko.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlbXNpYmF2YW5qZXJ0a2l6bmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTQwNDIsImV4cCI6MjA5OTI5MDA0Mn0.bVIy1Fmg3p2m73LT8F1xzFZTGkmc0EUgEfsTYP--iCk";

const DESTINATARIOS = [
  { uid: "leo", nombre: "Leonardo", email: "leonardo.ortiz@redsalud.cl" },
  { uid: "bas", nombre: "Bastián",  email: "bastian.retamal@redsalud.cl" },
  { uid: "iso", nombre: "Isidora",  email: "isidora.sepulvedaz@redsalud.cl" },
  { uid: "dan", nombre: "Daniela",  email: "daniela.riffo@redsalud.cl" },
  { uid: "joa", nombre: "Joaquín",  email: "joaquin.pena@redsalud.cl" },
  { uid: "edu", nombre: "Eduardo",  email: "eduardo.morales@redsalud.cl" },
];

const USERS = {
  leo: "Leonardo Ortiz", bas: "Bastián Retamal", iso: "Isidora Sepúlveda",
  dan: "Daniela Riffo",  joa: "Joaquín Peña",    edu: "Eduardo Morales",
};

const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

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

function getTasksInRange(tasks, from, to) {
  return tasks.filter(t => {
    if(!t.month || !t.day) return false;
    const taskDate = new Date(2026, t.month - 1, t.day);
    return taskDate >= from && taskDate <= to;
  });
}

function buildEmail(thisWeekTasks, nextWeekHitos, thisWeek, nextWeek) {
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
                <div style="font-weight:500;font-size:13px;color:#272a33;">${t.title}</div>
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

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if(authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Obtener tareas de Supabase
    const tasksResp = await fetch(`${SB_URL}/rest/v1/tasks?order=day.asc`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }
    });
    const allTasks = await tasksResp.json();

    // Calcular semanas
    const now = new Date();
    const thisWeek = getWeekRange(now);
    const nextWeekStart = new Date(thisWeek.fri);
    nextWeekStart.setDate(nextWeekStart.getDate() + 3);
    const nextWeek = getWeekRange(nextWeekStart);

    const thisWeekTasks = getTasksInRange(allTasks, thisWeek.mon, thisWeek.fri);
    const nextWeekHitos = getTasksInRange(allTasks, nextWeek.mon, nextWeek.fri)
      .filter(t => ["hito","cierre","audit","precierre","iceo"].includes(t.tipo || t.type));

    // Construir email único para todo el equipo
    const html = buildEmail(thisWeekTasks, nextWeekHitos, thisWeek, nextWeek);

    // Enviar UN solo email con todos en BCC via Resend
    // En modo testing solo llega al dueño de la cuenta,
    // pero con BCC todos reciben sin verse entre sí
    const todos = DESTINATARIOS.map(d => d.email);
    
    const emailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Control de Gestión <onboarding@resend.dev>",
        to: ["leonardo.ortiz@redsalud.cl"],  // destinatario principal
        bcc: todos.filter(e => e !== "leonardo.ortiz@redsalud.cl"), // resto en BCC
        subject: `⛏️ Resumen semanal CdG · ${new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit"})}`,
        html,
      }),
    });

    const result = await emailResp.json();

    return res.status(200).json({
      ok: emailResp.ok,
      thisWeekTasks: thisWeekTasks.filter(t=>(t.tipo||t.type)!=="rutina").length,
      nextWeekHitos: nextWeekHitos.length,
      result,
    });

  } catch(err) {
    console.error("weekly-reminder error:", err);
    return res.status(500).json({ error: err.message });
  }
}
