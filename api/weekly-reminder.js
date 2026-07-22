// api/weekly-reminder.js
// Corre automáticamente todos los lunes a las 8am (Chile = UTC-3, entonces 11:00 UTC)
// Enviá resumen de la semana en curso + hitos críticos de la siguiente semana

const SB_URL = "https://aemsibavanjertkiznko.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlbXNpYmF2YW5qZXJ0a2l6bmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTQwNDIsImV4cCI6MjA5OTI5MDA0Mn0.bVIy1Fmg3p2m73LT8F1xzFZTGkmc0EUgEfsTYP--iCk";

const DESTINATARIOS = [
  { nombre: "Leonardo", email: "leonardo.ortiz@redsalud.cl" },
  { nombre: "Bastián",  email: "bastian.retamal@redsalud.cl" },
];

const USERS = {
  leo: "Leonardo Ortiz",
  bas: "Bastián Retamal",
  iso: "Isidora Sepúlveda",
  dan: "Daniela Riffo",
  joa: "Joaquín Peña",
  edu: "Eduardo Morales",
};

const MESES = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

// Feriados Chile 2026
const FERIADOS = new Set([
  "2026-07-16","2026-08-15","2026-09-18","2026-09-19",
  "2026-10-12","2026-10-31","2026-11-01","2026-12-08","2026-12-25"
]);

function isHabil(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const iso = d.toISOString().split("T")[0];
  return dow !== 0 && dow !== 6 && !FERIADOS.has(iso);
}

function getWeekRange(date) {
  const d = new Date(date);
  const dow = d.getDay() || 7; // 1=Mon..7=Sun
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
  hito:      "🔴 Hito crítico",
  cierre:    "📊 Reunión de cierre",
  iceo:      "📋 Revisión ICEO",
  precierre: "📅 Pre-cierre",
  close:     "📂 Cierre ventas/provisión",
  capex:     "💰 CAPEX",
  audit:     "🔍 Auditoría",
  oferta:    "🏥 Oferta médica",
  cuad:      "⚖️ Cuadratura ICEO",
  rutina:    "🔁 Rutina",
  birthday:  "🎂 Cumpleaños",
  otro:      "📌 Otro",
};

export default async function handler(req, res) {
  // Verificar que sea el cron (seguridad básica)
  const authHeader = req.headers.authorization;
  if(authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Obtener todas las tareas de Supabase
    const tasksResp = await fetch(`${SB_URL}/rest/v1/tasks?order=day.asc`, {
      headers: {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
      }
    });
    const allTasks = await tasksResp.json();

    // Calcular semanas
    const now = new Date();
    const thisWeek = getWeekRange(now);
    const nextWeekStart = new Date(thisWeek.fri); nextWeekStart.setDate(nextWeekStart.getDate() + 3);
    const nextWeek = getWeekRange(nextWeekStart);

    // Filtrar tareas por semana y mes
    function getTasksInRange(tasks, from, to) {
      return tasks.filter(t => {
        if(!t.month || !t.day) return false;
        const taskDate = new Date(2026, t.month - 1, t.day);
        return taskDate >= from && taskDate <= to;
      });
    }

    const thisWeekTasks = getTasksInRange(allTasks, thisWeek.mon, thisWeek.fri);
    const nextWeekHitos = getTasksInRange(allTasks, nextWeek.mon, nextWeek.fri)
      .filter(t => ["hito","cierre","audit","precierre"].includes(t.tipo || t.type));

    // Agrupar tareas de esta semana por día (solo no-rutinas)
    const thisWeekNonRutina = thisWeekTasks.filter(t => (t.tipo || t.type) !== "rutina");

    // Agrupar por día
    const byDay = {};
    thisWeekNonRutina.forEach(t => {
      const key = `${t.month}-${t.day}`;
      if(!byDay[key]) byDay[key] = { month: t.month, day: t.day, tasks: [] };
      byDay[key].tasks.push(t);
    });

    // Construir HTML del email
    const buildEmail = (nombre) => {
      const weekLabel = `${fmt(thisWeek.mon)} – ${fmt(thisWeek.fri)}`;
      const nextLabel = `${fmt(nextWeek.mon)} – ${fmt(nextWeek.fri)}`;

      let diasHTML = "";
      const sortedDays = Object.values(byDay).sort((a,b) => a.day - b.day || a.month - b.month);

      if(sortedDays.length === 0) {
        diasHTML = `<p style="color:#888;font-style:italic;">Sin tareas relevantes esta semana.</p>`;
      } else {
        sortedDays.forEach(({month, day, tasks}) => {
          const date = new Date(2026, month-1, day);
          diasHTML += `
            <div style="margin-bottom:16px;">
              <div style="font-weight:700;font-size:13px;color:#1a2f63;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e8e5e0;">
                ${fmt(date)}
              </div>
              ${tasks.map(t => {
                const tipo = t.tipo || t.type;
                const tipoLabel = TIPO_LABEL[tipo] || "📌";
                const resp = getResponsables(Array.isArray(t.resp) ? t.resp : JSON.parse(t.resp || "[]"));
                return `
                  <div style="display:flex;gap:10px;padding:8px 10px;margin-bottom:4px;background:#fafaf8;border-radius:6px;border-left:3px solid ${tipo==="hito"?"#8a2438":tipo==="cierre"?"#1d6b53":"#1a2f63"};">
                    <div>
                      <div style="font-weight:600;font-size:13px;color:#272a33;">${t.title}</div>
                      <div style="font-size:11px;color:#888;margin-top:2px;">${tipoLabel} · ${resp}</div>
                    </div>
                  </div>`;
              }).join("")}
            </div>`;
        });
      }

      let hitosHTML = "";
      if(nextWeekHitos.length === 0) {
        hitosHTML = `<p style="color:#888;font-style:italic;">Sin hitos críticos la próxima semana.</p>`;
      } else {
        nextWeekHitos.sort((a,b) => a.day - b.day).forEach(t => {
          const date = new Date(2026, t.month-1, t.day);
          const tipo = t.tipo || t.type;
          const resp = getResponsables(Array.isArray(t.resp) ? t.resp : JSON.parse(t.resp || "[]"));
          hitosHTML += `
            <div style="display:flex;gap:10px;padding:10px 12px;margin-bottom:8px;background:#fff8f8;border-radius:8px;border-left:4px solid #8a2438;">
              <div>
                <div style="font-size:11px;color:#8a2438;font-weight:700;margin-bottom:3px;">${fmt(date)}</div>
                <div style="font-weight:700;font-size:13px;color:#272a33;">${t.title}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">Responsable: ${resp}</div>
              </div>
            </div>`;
        });
      }

      return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="background:#1a2f63;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">⛏️</div>
      <div style="color:white;font-weight:800;font-size:20px;">Control de Gestión</div>
      <div style="color:rgba(255,255,255,.7);font-size:12px;margin-top:4px;">Resumen semanal · ${weekLabel}</div>
    </div>

    <!-- Saludo -->
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;">
      <p style="color:#272a33;font-size:14px;margin:0 0 4px;">Hola ${nombre} 👋</p>
      <p style="color:#666;font-size:13px;margin:0;">Aquí tienes el resumen de actividades de esta semana y los hitos importantes de la siguiente.</p>
    </div>

    <!-- Esta semana -->
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;margin-top:2px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="background:#1a2f63;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">📅 ESTA SEMANA</div>
        <div style="color:#888;font-size:12px;">${weekLabel}</div>
      </div>
      ${diasHTML}
    </div>

    <!-- Hitos próxima semana -->
    <div style="background:white;padding:20px 28px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;margin-top:2px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <div style="background:#8a2438;color:white;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;">🔴 PRÓXIMA SEMANA</div>
        <div style="color:#888;font-size:12px;">${nextLabel}</div>
      </div>
      ${hitosHTML}
    </div>

    <!-- Footer -->
    <div style="background:#f0ede8;border-radius:0 0 12px 12px;padding:16px 28px;text-align:center;border:1px solid #e0ddd8;">
      <p style="color:#aaa;font-size:11px;margin:0;">
        Control de Gestión · Clínica RedSalud 2026<br/>
        <a href="https://cdg-control-gestion-cqoq.vercel.app" style="color:#1a2f63;">Abrir la app →</a>
      </p>
    </div>

  </div>
</body>
</html>`;
    };

    // Enviar emails
    const results = [];
    for(const dest of DESTINATARIOS) {
      const html = buildEmail(dest.nombre);
      const emailResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Control de Gestión <onboarding@resend.dev>",
          to: [dest.email],
          subject: `⛏️ Resumen semanal CdG · ${new Date().toLocaleDateString("es-CL", {day:"2-digit",month:"2-digit"})}`,
          html,
        }),
      });
      const result = await emailResp.json();
      results.push({ email: dest.email, ok: emailResp.ok, result });
    }

    return res.status(200).json({
      ok: true,
      sent: results.length,
      thisWeekTasks: thisWeekNonRutina.length,
      nextWeekHitos: nextWeekHitos.length,
      results,
    });

  } catch(err) {
    console.error("weekly-reminder error:", err);
    return res.status(500).json({ error: err.message });
  }
}
