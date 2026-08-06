import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────
const SB_URL = "https://gmtcsaoiaeknpzoyljjm.supabase.co";
const SB_KEY = "sb_publishable_nGNtvR2vpCtb1GmvRZq-hg_PUOMPEJt";
const SB_H = { "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}`, "Content-Type":"application/json", "Prefer":"return=representation" };

async function sbFetch(path, opts={}) {
  const r = await fetch(`${SB_URL}/rest/v1${path}`, { headers:SB_H, ...opts });
  const txt = await r.text();
  if(!r.ok) throw new Error(txt);
  return txt ? JSON.parse(txt) : [];
}
const db = {
  getTasks:    ()=> sbFetch("/tasks?order=day.asc"),
  getComments: ()=> sbFetch("/comments?order=created_at.asc"),
  upsertTask:  (t)=> sbFetch("/tasks?on_conflict=id", {method:"POST",
    body: JSON.stringify({id:t.id,day:t.day,month:t.month||7,type:t.type,title:t.title,resp:t.resp,notes:t.notes||null,fixed:!!t.fixed,status:t.status||"pendiente"}),
    headers:{...SB_H,"Prefer":"resolution=merge-duplicates,return=representation"}}),
  deleteTask:  (id)=> sbFetch(`/tasks?id=eq.${id}`, {method:"DELETE"}),
  addComment:  (taskId,uid,text)=> sbFetch("/comments",{method:"POST",body:JSON.stringify({task_id:taskId,user_id:uid,text})}),
  seedTasks:   async(tasks)=>{ await sbFetch("/tasks?id=neq.NONE",{method:"DELETE"}); for(const t of tasks) await db.upsertTask(t); },
  // ── Notifications ──
  getNotifications: (uid)=> sbFetch(`/notifications?user_id=eq.${uid}&order=created_at.desc&limit=50`),
  addNotification:  (n)=> sbFetch("/notifications",{method:"POST",body:JSON.stringify(n)}),
  markRead:    (id)=> sbFetch(`/notifications?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({read:true})}),
  markAllRead: (uid)=> sbFetch(`/notifications?user_id=eq.${uid}&read=eq.false`,{method:"PATCH",body:JSON.stringify({read:true})}),
  // ── Pendientes ──
  getPendientes: ()=> sbFetch("/pendientes?order=created_at.asc"),
  upsertPendiente: (p)=> sbFetch("/pendientes?on_conflict=id", {method:"POST",
    body: JSON.stringify({id:p.id, label:p.label, status:p.status, resp:p.resp, created_by:p.created_by||null, urgencia:p.urgencia||2, importancia:p.importancia||2, fecha:p.fecha||null}),
    headers:{...SB_H,"Prefer":"resolution=merge-duplicates,return=representation"}}),
  deletePendiente: (id)=> sbFetch(`/pendientes?id=eq.${id}`, {method:"DELETE"}),
  // ── Tarjetas ──
  getTarjetas: ()=> sbFetch("/tarjetas?order=created_at.desc&limit=200"),
  addTarjeta:  (t)=> sbFetch("/tarjetas", {method:"POST", body:JSON.stringify(t)}),
  deleteTarjeta:(id)=> sbFetch(`/tarjetas?id=eq.${id}`, {method:"DELETE"}),
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const USERS = [
  {id:"leo", name:"Leonardo Ortiz",    role:"admin",  color:"#1a2f63", initials:"LO"},
  {id:"bas", name:"Bastián Retamal",   role:"admin",  color:"#a3265c", initials:"BR"},
  {id:"iso", name:"Isidora Sepúlveda", role:"editor", color:"#5b3f8c", initials:"IS"},
  {id:"dan", name:"Daniela Riffo",     role:"editor", color:"#b9711b", initials:"DR"},
  {id:"joa", name:"Joaquín Peña",      role:"editor", color:"#0e6e74", initials:"JP"},
  {id:"edu", name:"Eduardo Morales",   role:"editor", color:"#2e6b3a", initials:"EM"},
];

const BIRTHDAYS = [
  {uid:"iso", name:"Isidora Sepúlveda", month:1,  day:6},
  {uid:"joa", name:"Joaquín Peña",      month:2,  day:5},
  {uid:"bas", name:"Bastián Retamal",   month:3,  day:27},
  {uid:"dan", name:"Daniela Riffo",     month:11, day:30},
  {uid:"leo", name:"Leonardo Ortiz",    month:12, day:1},
  {uid:"edu", name:"Eduardo Morales",   month:12, day:19},
];

const TASK_TYPES = [
  {id:"iceo",      label:"Revisión ICEO",             bg:"#1a2f63", fg:"white"},
  {id:"close",     label:"Cierre ventas/provisión",   bg:"#e4f0ea", fg:"#1d6b53"},
  {id:"precierre", label:"Pre-cierre",                bg:"#fbeedd", fg:"#b9711b"},
  {id:"cierre",    label:"Reunión de cierre",         bg:"#1d6b53", fg:"white"},
  {id:"cuad",      label:"Cuadratura / apertura ICEO",bg:"#ece5f5", fg:"#5b3f8c"},
  {id:"capex",     label:"CAPEX",                     bg:"#f7ead4", fg:"#b9711b"},
  {id:"hito",      label:"Hito crítico",              bg:"#8a2438", fg:"white"},
  {id:"audit",     label:"Auditoría",                 bg:"#eee3cf", fg:"#7a5a17"},
  {id:"oferta",    label:"Oferta médica/oncológica",  bg:"#e6e9f6", fg:"#3b4d8c"},
  {id:"rutina",    label:"Rutina recurrente",         bg:"#dff0ee", fg:"#0e6e74"},
  {id:"birthday",  label:"Cumpleaños",                bg:"#fde8f5", fg:"#a3265c"},
  {id:"otro",      label:"Otro",                      bg:"#eef0f4", fg:"#5b5f6b"},
];

// Month config: which months have collaborative calendars
const MONTHS = [
  {num:7,  label:"Julio",      days:31, startOffset:2}, // Jul 1 = Wed
  {num:8,  label:"Agosto",     days:31, startOffset:0}, // Aug 1 = Sat → Mon offset 0 but Sat/Sun skipped, Aug 1=Sat
  {num:9,  label:"Septiembre", days:30, startOffset:1}, // Sep 1 = Tue
  {num:10, label:"Octubre",    days:31, startOffset:3}, // Oct 1 = Thu
  {num:11, label:"Noviembre",  days:30, startOffset:5}, // Nov 1 = Sun → skip to Mon
  {num:12, label:"Diciembre",  days:31, startOffset:1}, // Dec 1 = Tue
];

// Get day-of-week index (0=Mon..4=Fri) for a given month/day in 2026
function getDOW(month, day) {
  const d = new Date(2026, month-1, day);
  const jsDay = d.getDay(); // 0=Sun,1=Mon...6=Sat
  return jsDay === 0 ? 6 : jsDay - 1; // 0=Mon..6=Sun
}
function isWeekend(month, day) {
  const dow = getDOW(month, day);
  return dow >= 5;
}
function getWorkDays(month) {
  const m = MONTHS.find(x=>x.num===month);
  if(!m) return [];
  const wd = [];
  for(let d=1; d<=m.days; d++) {
    if(!isWeekend(month, d)) wd.push(d);
  }
  return wd;
}
function getGridOffset(month) {
  // How many empty Mon-Fri cells before day 1
  for(let d=1; d<=7; d++) {
    if(!isWeekend(month, d)) return getDOW(month, d);
  }
  return 0;
}

// Feriados 2026 Chile relevantes (mes, día)
const FERIADOS = [
  {month:7, day:16, label:"Virgen del Carmen"},
  {month:8, day:15, label:"Asunción de la Virgen"},
  {month:9, day:18, label:"Independencia"},
  {month:9, day:19, label:"Glorias del Ejército"},
  {month:10,day:12, label:"Encuentro de dos mundos"},
  {month:10,day:31, label:"Día de las Iglesias"},
  {month:11,day:1,  label:"Día de todos los santos"},
  {month:12,day:8,  label:"Inmaculada Concepción"},
  {month:12,day:25, label:"Navidad"},
];
function isFeriado(month, day) { return FERIADOS.find(f=>f.month===month && f.day===day); }

const INITIAL_TASKS = [
  // ── JULIO ──
  {id:"t1",  month:7, day:1,  type:"close",     title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"], fixed:true},
  {id:"t2",  month:7, day:1,  type:"precierre",  title:"Pre-cierre",                             resp:["edu","bas","iso"], fixed:true},
  {id:"t3",  month:7, day:1,  type:"rutina",     title:"CG Matriz",                              resp:["leo"], fixed:true},
  {id:"t4",  month:7, day:1,  type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t5",  month:7, day:1,  type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t6",  month:7, day:1,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t7",  month:7, day:2,  type:"close",      title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"], fixed:true},
  {id:"t8",  month:7, day:2,  type:"precierre",  title:"Pre-cierre",                             resp:["edu","bas","iso"], fixed:true},
  {id:"t9",  month:7, day:2,  type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t10", month:7, day:2,  type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t11", month:7, day:2,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t12", month:7, day:3,  type:"close",      title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"], fixed:true},
  {id:"t13", month:7, day:3,  type:"precierre",  title:"Pre-cierre",                             resp:["edu","bas","iso"], fixed:true},
  {id:"t14", month:7, day:3,  type:"rutina",     title:"Control Cajas",                          resp:["iso"], fixed:true},
  {id:"t15", month:7, day:3,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t16", month:7, day:6,  type:"rutina", title:"Cuadratura y apertura ICEO", resp:["joa","iso"], fixed:true},
  {id:"t16b",month:7, day:6,  type:"rutina", title:"Carga week",                  resp:["iso"],       fixed:true},
  {id:"t17", month:7, day:6,  type:"precierre",  title:"Pre-cierre",                             resp:["edu","bas","iso"]},
  {id:"t18", month:7, day:6,  type:"capex",      title:"Levantamiento final CAPEX (interno)",    resp:["dan"]},
  {id:"t19", month:7, day:6,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t20", month:7, day:7,  type:"iceo",       title:"Revisión ICEO — Operacional + Calidad",  resp:["iso"]},
  {id:"t21", month:7, day:7,  type:"cierre",     title:"Reunión de cierre",                      resp:["leo","iso"]},
  {id:"t22", month:7, day:7,  type:"hito",       title:"Lanzamiento PPA",                        resp:["edu","leo"]},
  {id:"t23", month:7, day:7,  type:"rutina",     title:"Capex matriz",                           resp:["dan"], fixed:true},
  {id:"t24", month:7, day:7,  type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t25", month:7, day:7,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t26", month:7, day:8,  type:"hito",       title:"Cierre de mes — provisión + indicadores",resp:["leo","bas"]},
  {id:"t27", month:7, day:8,  type:"cierre",     title:"Reunión de cierre",                      resp:["leo"]},
  {id:"t28", month:7, day:8,  type:"audit",      title:"Avance carta auditores",                 resp:["leo","bas"]},
  {id:"t29", month:7, day:8,  type:"oferta",     title:"Oferta Consulta Médica y Quirúrgica",    resp:["iso","leo"]},
  {id:"t30", month:7, day:8,  type:"rutina",     title:"CG Matriz",                              resp:["leo"], fixed:true},
  {id:"t31", month:7, day:8,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t32", month:7, day:9,  type:"capex",      title:"Levantamiento final CAPEX 2.0",          resp:["dan"]},
  {id:"t33", month:7, day:9,  type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t34", month:7, day:9,  type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t35", month:7, day:9,  type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t36", month:7, day:10, type:"hito",       title:"Plazo final CAPEX — clínica",            resp:["dan"]},
  {id:"t37", month:7, day:10, type:"rutina",     title:"Control Cajas",                          resp:["iso"], fixed:true},
  {id:"t38", month:7, day:10, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t39", month:7, day:13, type:"rutina", title:"Cuadratura y apertura ICEO", resp:["joa","iso"], fixed:true},
  {id:"t39b",month:7, day:13, type:"rutina", title:"Carga week",                  resp:["iso"],       fixed:true},
  {id:"t40", month:7, day:13, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t41", month:7, day:14, type:"iceo",       title:"Revisión ICEO — Financiera + CG",        resp:["leo"]},
  {id:"t42", month:7, day:14, type:"rutina",     title:"Capex matriz",                           resp:["dan"], fixed:true},
  {id:"t43", month:7, day:14, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t44", month:7, day:14, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t45", month:7, day:14, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t46", month:7, day:15, type:"oferta",     title:"Ticket Médico Quirúrgico (Cir. Gral · Cardio · Trauma · Otorrino)", resp:["iso"]},
  {id:"t47", month:7, day:15, type:"rutina",     title:"CG Matriz",                              resp:["leo"], fixed:true},
  {id:"t48", month:7, day:15, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t49", month:7, day:17, type:"rutina",     title:"Control Cajas",                          resp:["iso"], fixed:true},
  {id:"t50", month:7, day:17, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t51", month:7, day:20, type:"rutina", title:"Cuadratura y apertura ICEO", resp:["joa","iso"], fixed:true},
  {id:"t51b",month:7, day:20, type:"rutina", title:"Carga week",                  resp:["iso"],       fixed:true},
  {id:"t52", month:7, day:20, type:"hito",       title:"Cuadratura cuentas por cobrar",          resp:["bas"]},
  {id:"t53", month:7, day:20, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t54", month:7, day:21, type:"iceo",       title:"Revisión ICEO — Soporte + Personas",     resp:["joa"]},
  {id:"t55", month:7, day:21, type:"rutina",     title:"Capex matriz",                           resp:["dan"], fixed:true},
  {id:"t56", month:7, day:21, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t57", month:7, day:21, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t58", month:7, day:21, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t59", month:7, day:22, type:"oferta",     title:"Análisis de oferta oncológica",          resp:["leo"]},
  {id:"t60", month:7, day:22, type:"rutina",     title:"CG Matriz",                              resp:["leo"], fixed:true},
  {id:"t61", month:7, day:22, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t62", month:7, day:23, type:"hito",       title:"Comité ampliado — no presentamos",       resp:["leo"]},
  {id:"t63", month:7, day:23, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t64", month:7, day:23, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t65", month:7, day:23, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t66", month:7, day:24, type:"rutina",     title:"Control Cajas",                          resp:["iso"], fixed:true},
  {id:"t67", month:7, day:24, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t68", month:7, day:27, type:"rutina", title:"Cuadratura y apertura ICEO", resp:["joa","iso"], fixed:true},
  {id:"t68b",month:7, day:27, type:"rutina", title:"Carga week",                  resp:["iso"],       fixed:true},
  {id:"t69", month:7, day:27, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t70", month:7, day:28, type:"iceo",       title:"Revisión ICEO — Comercial + Marketing",  resp:["bas","dan"]},
  {id:"t71", month:7, day:28, type:"rutina",     title:"Capex matriz",                           resp:["dan"], fixed:true},
  {id:"t72", month:7, day:28, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t73", month:7, day:28, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t74", month:7, day:28, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t75", month:7, day:29, type:"close",      title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"]},
  {id:"t76", month:7, day:29, type:"rutina",     title:"CG Matriz",                              resp:["leo"], fixed:true},
  {id:"t77", month:7, day:29, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t78", month:7, day:29, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t79", month:7, day:29, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t80", month:7, day:30, type:"close",      title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"]},
  {id:"t81", month:7, day:30, type:"hito",       title:"Comité — si nos toca presentar",         resp:["leo","bas"]},
  {id:"t82", month:7, day:30, type:"rutina",     title:"Control de Alta",                        resp:["dan"], fixed:true},
  {id:"t83", month:7, day:30, type:"rutina",     title:"Aprobación de Solicitudes",              resp:["dan","joa"], fixed:true},
  {id:"t84", month:7, day:30, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  {id:"t85", month:7, day:31, type:"close",      title:"Cierre: ventas y provisión",             resp:["edu","bas","iso"]},
  {id:"t86", month:7, day:31, type:"hito",       title:"Reporte Mensual ILC",                    resp:["bas"]},
  {id:"t87", month:7, day:31, type:"rutina",     title:"Control Cajas",                          resp:["iso"], fixed:true},
  {id:"t88", month:7, day:31, type:"rutina",     title:"Ley de Urgencia",                        resp:["dan"], fixed:true},
  // ── AGOSTO ──
  {id:"a1",  month:8, day:10, type:"cierre",     title:"Reunión de cierre — 6° día hábil",       resp:["leo","bas"]},
  {id:"a2",  month:8, day:18, type:"hito",       title:"Business Review — trimestral / YTD",     resp:["leo","bas"]},
  {id:"a3",  month:8, day:19, type:"hito",       title:"Comité Financiero — Master Plan",        resp:["leo","bas"]},
  {id:"a4",  month:8, day:20, type:"hito",       title:"Comité ampliado — no presentamos",       resp:["leo"]},
  {id:"a5",  month:8, day:31, type:"hito",       title:"PPA — seguimiento lanzamiento",          resp:["edu","leo"]},
  // ── SEPTIEMBRE ──
  {id:"s1",  month:9, day:8,  type:"cierre",     title:"Reunión de cierre — 6° día hábil",       resp:["leo","bas"]},
  {id:"s2",  month:9, day:24, type:"hito",       title:"Comité ampliado — sí presentamos",       resp:["leo","bas"]},
  // ── OCTUBRE ──
  {id:"o1",  month:10,day:8,  type:"cierre",     title:"Reunión de cierre — 6° día hábil",       resp:["leo","bas"]},
  {id:"o2",  month:10,day:15, type:"otro",       title:"1:1 — conversaciones uno a uno",         resp:["leo","bas"]},
  {id:"o3",  month:10,day:22, type:"hito",       title:"Comité ampliado — no presentamos",       resp:["leo"]},
  // ── NOVIEMBRE ──
  {id:"n1",  month:11,day:6,  type:"hito",       title:"Cierre Presupuesto Clínica 2027",        resp:["leo","bas"]},
  {id:"n2",  month:11,day:9,  type:"cierre",     title:"Reunión de cierre — 6° día hábil",       resp:["leo","bas"]},
  {id:"n3",  month:11,day:17, type:"hito",       title:"Business Review — trimestral / YTD",     resp:["leo","bas"]},
  {id:"n4",  month:11,day:19, type:"hito",       title:"Comité ampliado — sí presentamos",       resp:["leo","bas"]},
  {id:"n5",  month:11,day:30, type:"birthday",   title:"🎂 Cumpleaños Daniela Riffo",            resp:["dan"], fixed:true},
  // ── DICIEMBRE ──
  {id:"d1",  month:12,day:1,  type:"birthday",   title:"🎂 Cumpleaños Leonardo Ortiz",           resp:["leo"], fixed:true},
  {id:"d2",  month:12,day:9,  type:"cierre",     title:"Reunión de cierre — 6° día hábil",       resp:["leo","bas"]},
  {id:"d3",  month:12,day:17, type:"otro",       title:"1:1 — conversaciones uno a uno",         resp:["leo","bas"]},
  {id:"d4",  month:12,day:19, type:"birthday",   title:"🎂 Cumpleaños Eduardo Morales",          resp:["edu"], fixed:true},
];

// ─────────────────────────────────────────────
// ROADMAP DATA
// ─────────────────────────────────────────────
const ROADMAP = [
  { month:"JULIO 2026", monthNum:7, color:"#1a2f63", items:[
    {date:"06 jul", day:6,  monthNum:7, bg:"#b9711b", label:"Levantamiento final CAPEX (interno)", desc:"Cierre del trabajo interno del equipo, previo al plazo de la clínica. Responsable: Daniela Riffo."},
    {date:"07 jul", day:7,  monthNum:7, bg:"#2e6b3a", label:"Lanzamiento PPA", desc:"Responsables: Eduardo Morales y Leonardo Ortiz."},
    {date:"08 jul", day:8,  monthNum:7, bg:"#1a2f63", label:"Cierre de mes + avance carta auditores", desc:"Provisión contable consolidada con indicadores; revisión de control interno. Responsables: Bastián Retamal y Leonardo Ortiz."},
    {date:"08 jul", day:8,  monthNum:7, bg:"#3b4d8c", label:"Oferta Consulta Médica y Quirúrgica", desc:"Responsables: Isidora Sepúlveda y Leonardo Ortiz."},
    {date:"10 jul", day:10, monthNum:7, bg:"#b9711b", label:"Plazo final CAPEX — clínica", desc:"Fecha límite definida por la clínica para la entrega. Responsable: Daniela Riffo."},
    {date:"15 jul", day:15, monthNum:7, bg:"#3b4d8c", label:"Ticket Médico Quirúrgico", desc:"Resp. Isidora. Cirugía general, cardiología, traumatología, otorrino."},
    {date:"22 jul", day:22, monthNum:7, bg:"#3b4d8c", label:"Análisis de oferta oncológica", desc:"Responsable: Leonardo Ortiz."},
    {date:"30 jul", day:30, monthNum:7, bg:"#8a2438", label:"Comité — sí presentamos", desc:"Responsables: Bastián Retamal y Leonardo Ortiz."},
    {date:"31 jul", day:31, monthNum:7, bg:"#a3265c", label:"Reporte Mensual ILC", desc:"Responsable: Bastián Retamal."},
  ]},
  { month:"AGOSTO 2026", monthNum:8, color:"#1d6b53", items:[
    {date:"01 ago →", day:1,  monthNum:8, bg:"#5b3f8c", label:"Inicio Presupuesto Clínica 2027", desc:"Arranca el proceso anual, liderado por Control de Gestión.", span:true},
    {date:"10 ago",   day:10, monthNum:8, bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"18 ago",   day:18, monthNum:8, bg:"#0e6e74", label:"Business Review — trimestral / YTD", desc:"Tercer martes. Revisión trimestral y acumulada del año."},
    {date:"19 ago",   day:19, monthNum:8, bg:"#1a2f63", label:"Comité Financiero — Master Plan", desc:"Reagendado desde julio. Revisión del plan maestro de inversión."},
    {date:"20 ago",   day:20, monthNum:8, bg:"#8a2438", label:"Comité — no presentamos", desc:"Penúltimo jueves del mes. No le corresponde a Control de Gestión exponer."},
    {date:"31 ago",   day:31, monthNum:8, bg:"#2e6b3a", label:"PPA", desc:"Seguimiento del lanzamiento. Responsables: Eduardo Morales y Leonardo Ortiz."},
  ]},
  { month:"SEPTIEMBRE 2026", monthNum:9, color:"#5b3f8c", items:[
    {date:"08 sep",      day:8,  monthNum:9, bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"24 sep",      day:24, monthNum:9, bg:"#8a2438", label:"Comité — sí presentamos", desc:"Le corresponde a Control de Gestión exponer."},
    {date:"todo el mes", day:30, monthNum:9, bg:"#5b3f8c", label:"Presupuesto Clínica 2027 — desarrollo", desc:"Construcción y validación, en paralelo al ritmo mensual.", span:true},
  ]},
  { month:"OCTUBRE 2026", monthNum:10, color:"#b9711b", items:[
    {date:"08 oct",      day:8,  monthNum:10, bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"15 oct",      day:15, monthNum:10, bg:"#6b6f78", label:"1:1 — conversaciones uno a uno", desc:"Tercer jueves del mes."},
    {date:"22 oct",      day:22, monthNum:10, bg:"#8a2438", label:"Comité — no presentamos", desc:"Penúltimo jueves del mes."},
    {date:"todo el mes", day:31, monthNum:10, bg:"#5b3f8c", label:"Presupuesto 2027 — desarrollo", desc:"Última etapa, previa al cierre de la 1ª semana de noviembre.", span:true},
  ]},
  { month:"NOV · DIC 2026", monthNum:11, color:"#8a2438", items:[
    {date:"→ 06 nov", day:6,  monthNum:11, bg:"#5b3f8c", label:"Cierre Presupuesto Clínica 2027", desc:"Consolidación final en la primera semana de noviembre.", span:true},
    {date:"09 nov",   day:9,  monthNum:11, bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil de noviembre."},
    {date:"17 nov",   day:17, monthNum:11, bg:"#0e6e74", label:"Business Review — trimestral / YTD", desc:"Tercer martes. Siguiente revisión tras la de agosto."},
    {date:"19 nov",   day:19, monthNum:11, bg:"#8a2438", label:"Comité — sí presentamos", desc:"Penúltimo jueves del mes. Le corresponde a Control de Gestión exponer."},
    {date:"30 nov",   day:30, monthNum:11, bg:"#a3265c", label:"🎂 Cumpleaños Daniela Riffo", desc:""},
    {date:"01 dic",   day:1,  monthNum:12, bg:"#1a2f63", label:"🎂 Cumpleaños Leonardo Ortiz", desc:""},
    {date:"09 dic",   day:9,  monthNum:12, bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil de diciembre."},
    {date:"17 dic",   day:17, monthNum:12, bg:"#6b6f78", label:"1:1 — conversaciones uno a uno", desc:"Tercer jueves del mes. Última ronda del año."},
    {date:"19 dic",   day:19, monthNum:12, bg:"#2e6b3a", label:"🎂 Cumpleaños Eduardo Morales", desc:""},
  ]},
];

// ─────────────────────────────────────────────
// PENDIENTES
// ─────────────────────────────────────────────
const PENDIENTES = [
  {status:"por iniciar", label:"Costeo de prestaciones"},
  {status:"por iniciar", label:"Curva de deterioro"},
  {status:"por iniciar", label:"Auxiliar contable de honorarios médicos por pagar"},
  {status:"por iniciar", label:"Evaluación de proyectos (estructura y proceso)"},
  {status:"no válido",   label:"Evaluación Master Plan (estacionamiento)"},
  {status:"por iniciar", label:"Evaluación desviación flujo de caja vs. 2025"},
  {status:"listo",       label:"Auxiliar Facturas por cobrar (curva de deterioro)"},
  {status:"en ajuste",   label:"Implementación del modelo de Performance Management"},
];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const getTypeStyle = (id) => TASK_TYPES.find(t=>t.id===id) || TASK_TYPES[TASK_TYPES.length-1];
const getUserById  = (id) => USERS.find(u=>u.id===id);

function Avatar({uid, size=16}) {
  const u = getUserById(uid);
  if(!u) return null;
  return <span title={u.name} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:size,height:size,borderRadius:"50%",background:u.color,color:"white",fontSize:size*.38,fontWeight:700,fontFamily:"monospace",border:"1.5px solid white",flexShrink:0}}>{u.initials}</span>;
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const [page, setPage]             = useState(1);
  const [currentUser, setCurrentUser] = useState(null);
  const [tasks, setTasks]           = useState([]);
  const [comments, setComments]     = useState({});
  const [loaded, setLoaded]         = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(()=>new Date().getMonth()+1);
  const [activeTask, setActiveTask] = useState(null);
  const [filterType, setFilterType] = useState(null);
  const [filterResp, setFilterResp] = useState(null);
  const [showRutinas, setShowRutinas] = useState(true);
  const [dragSrc, setDragSrc]       = useState(null);
  const [dragOver, setDragOver]     = useState(null);
  const [dupTarget, setDupTarget]   = useState(null);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [toast, setToast]           = useState(null);
  const [lastError, setLastError]   = useState(null);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [pendientes, setPendientes] = useState([]);
  const mob = useIsMobile();
  const pollRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),2500); };

  // ── Load ──
  async function loadFromDB(silent=false) {
    try {
      // Cargar tareas primero (más importante) luego el resto
      const rawT = await db.getTasks();
      if(rawT.length===0) {
        await db.seedTasks(INITIAL_TASKS);
        setTasks(INITIAL_TASKS);
      } else {
        setTasks(rawT.map(t=>({...t, resp:Array.isArray(t.resp)?t.resp:(JSON.parse(t.resp||"[]")), status:t.status||"pendiente"})));
      }
      if(!silent) setLoaded(true); // Mostrar app apenas tenemos tareas

      // Cargar el resto en paralelo después
      const [rawC, rawP] = await Promise.all([db.getComments(), db.getPendientes()]);

      if(rawP.length===0) {
        const initial = PENDIENTES.map((p,i)=>({...p,id:`p${i}`,resp:p.resp||[],created_by:null}));
        for(const p of initial) await db.upsertPendiente(p);
        setPendientes(initial);
      } else {
        setPendientes(rawP.map(p=>({...p,resp:Array.isArray(p.resp)?p.resp:(JSON.parse(p.resp||"[]"))})));
      }

      const grouped = {};
      rawC.forEach(c=>{ if(!grouped[c.task_id]) grouped[c.task_id]=[]; grouped[c.task_id].push({uid:c.user_id,text:c.text,ts:new Date(c.created_at).getTime()}); });
      setComments(grouped);

    } catch(e) {
      console.error(e);
      setTasks(INITIAL_TASKS);
      setPendientes(PENDIENTES.map((p,i)=>({...p,id:`p${i}`,resp:[]})));
      setComments({});
      if(!silent) setLoaded(true);
    }
  }

  // ── Load notificaciones del usuario actual ──
  async function loadNotifications(uid) {
    try {
      const notifs = await db.getNotifications(uid);
      setNotifications(notifs);
    } catch(e) { console.error(e); }
  }

  // ── Enviar notificación ──
  async function sendNotif(toUid, type, message, task) {
    if(!currentUser || toUid === currentUser.id) return; // no notificarse a sí mismo
    try {
      await db.addNotification({
        user_id: toUid,
        type,
        message,
        task_id: task?.id || null,
        task_title: task?.title || null,
        created_by: currentUser.id,
        read: false,
      });
    } catch(e) { console.error("sendNotif error:", e); }
  }

  // ── Notificar nueva tarea a admins ──
  async function notifyNewTask(task) {
    const admins = USERS.filter(u => u.role === "admin");
    for(const admin of admins) {
      const creator = USERS.find(u=>u.id===currentUser.id);
      await sendNotif(admin.id, "nueva_tarea",
        `${creator?.name} agregó una nueva tarea: "${task.title}" (día ${task.day})`, task);
    }
  }

  // ── Notificar a responsables asignados ──
  async function notifyAssigned(task, prevResp=[]) {
    const newlyAdded = task.resp.filter(uid => !prevResp.includes(uid));
    for(const uid of newlyAdded) {
      const creator = USERS.find(u=>u.id===currentUser.id);
      await sendNotif(uid, "asignado",
        `${creator?.name} te asignó a la tarea: "${task.title}" (día ${task.day})`, task);
    }
  }

  useEffect(()=>{ loadFromDB(); },[]);
  useEffect(()=>{ pollRef.current=setInterval(()=>loadFromDB(true),60000); return ()=>clearInterval(pollRef.current); },[]);
  useEffect(()=>{ if(currentUser) { loadNotifications(currentUser.id); const t=setInterval(()=>loadNotifications(currentUser.id),90000); return ()=>clearInterval(t); } },[currentUser]);

  // ── Persist ──
  async function persistTask(t) {
    setSyncStatus("saving");
    try {
      await db.upsertTask(t);
      setSyncStatus("idle");
      return true;
    } catch(e) {
      console.error("persistTask error:", e);
      setSyncStatus("error");
      setTimeout(()=>setSyncStatus("idle"),3000);
      // Mostrar error exacto para diagnóstico
      setLastError(e.message || JSON.stringify(e));
      return false;
    }
  }
  async function persistDelete(id) {
    setSyncStatus("saving");
    try { await db.deleteTask(id); setSyncStatus("idle"); }
    catch(e) { console.error(e); setSyncStatus("error"); }
  }
  function updateTasks(fn, sync=null) {
    setTasks(prev=>{ const n=fn(prev); return n; });
    if(sync) persistTask(sync);
  }

  // ── Actions ──
  function onDrop(e, day) {
    e.preventDefault(); setDragOver(null);
    if(!dragSrc||!currentUser||currentUser.role==="viewer") return;
    const task = tasks.find(t=>t.id===dragSrc);
    if(!task||task.day===day) return;
    const updated = {...task, day};
    setTasks(prev=>prev.map(t=>t.id===dragSrc?updated:t));
    persistTask(updated);
    showToast(`Movida al día ${day}`); setDragSrc(null);
  }
  function handleDupClick(day) {
    if(!dupTarget) return;
    const task = tasks.find(t=>t.id===dupTarget);
    if(!task) { setDupTarget(null); return; }
    const nt = {...task, id:"t_"+Date.now(), day, fixed:false};
    setTasks(prev=>[...prev,nt]);
    persistTask(nt);
    showToast(`Duplicado al día ${day}`); setDupTarget(null);
  }
  function addTask(day) {
    if(!currentUser||currentUser.role==="viewer") return;
    const nt = {id:"t_"+Date.now(), month:selectedMonth, day, type:"otro", title:"Nueva tarea", resp:[currentUser.id], fixed:false};
    setTasks(prev=>[...prev,nt]);
    persistTask(nt);
    notifyNewTask(nt);
    setActiveTask(nt);
  }
  async function saveTask(updated) {
    // Detectar responsables anteriores para saber quiénes son nuevos
    const prevTask = tasks.find(t=>t.id===updated.id);
    const prevResp = prevTask?.resp || [];
    // Actualizar estado local inmediatamente
    setTasks(prev=>prev.map(t=>t.id===updated.id?updated:t));
    setActiveTask(updated);
    // Persistir en Supabase
    const ok = await persistTask(updated);
    if(ok) {
      showToast("Guardado ✓");
      // Notificar a nuevos responsables asignados
      notifyAssigned(updated, prevResp);
    } else {
      showToast("⚠️ Error al guardar — intenta de nuevo");
    }
  }
  function deleteTask(id) {
    if(!currentUser||currentUser.role==="viewer") return;
    setTasks(prev=>prev.filter(t=>t.id!==id));
    persistDelete(id);
    setActiveTask(null); showToast("Eliminada");
  }
  async function addComment(taskId, text) {
    if(!currentUser||!text.trim()) return;
    const entry = {uid:currentUser.id, text:text.trim(), ts:Date.now()};
    setComments(prev=>({...prev,[taskId]:[...(prev[taskId]||[]),entry]}));
    try { await db.addComment(taskId,currentUser.id,text.trim()); } catch(e){console.error(e);}
  }

  function toggleTaskStatus(taskId) {
    const task = tasks.find(t=>t.id===taskId);
    if(!task) return;
    const newStatus = task.status==="listo" ? "pendiente" : "listo";
    const updated = {...task, status:newStatus};
    setTasks(prev=>prev.map(t=>t.id===taskId?updated:t));
    persistTask(updated);
  }
  async function resetData() {
    if(currentUser.id !== "leo") return;
    const primera = window.confirm("⚠️ ATENCIÓN\n\nEsta acción eliminará TODAS las tareas del calendario y las recargará desde cero.\n\nLos pendientes, tarjetas y notas NO se verán afectados.\n\n¿Estás seguro que deseas continuar?");
    if(!primera) return;
    const segunda = window.confirm("🔴 CONFIRMACIÓN FINAL\n\nSe borrarán permanentemente todas las tareas y comentarios del calendario.\n\nEscribe OK en el siguiente paso para confirmar.");
    if(!segunda) return;
    const confirmText = window.prompt('Escribe "RESETEAR" para confirmar:');
    if(confirmText !== "RESETEAR") { window.alert("Operación cancelada — texto incorrecto."); return; }
    setSyncStatus("saving");
    try {
      await db.seedTasks(INITIAL_TASKS);
      await sbFetch("/comments?id=gt.0",{method:"DELETE"});
      setTasks(INITIAL_TASKS); setComments({}); setSyncStatus("idle"); showToast("Reseteado ✓");
    } catch(e) { console.error(e); setSyncStatus("error"); }
  }

  if(!loaded) return <Splash/>;
  if(!currentUser) return <LoginScreen users={USERS} onLogin={setCurrentUser}/>;

  const monthTasks = (m,d) => {
    let ts = tasks.filter(t=>t.month===m && t.day===d);
    if(!showRutinas) ts=ts.filter(t=>t.type!=="rutina");
    if(filterType==="hito") ts=ts.filter(t=>["hito","cierre","audit"].includes(t.type));
    if(filterType==="repetitiva") ts=ts.filter(t=>["rutina","cuad","iceo","close"].includes(t.type));
    if(filterResp) ts=ts.filter(t=>t.resp.includes(filterResp));
    return ts;
  };

  const NAV_TABS = [
    {n:1, icon:"📅", label:"Calendario"},
    {n:2, icon:"⚠️", label:"Pendientes"},
    {n:3, icon:"🟨", label:"Tarjetas"},
    {n:4, icon:"🗂️", label:"Planificación"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#f5f3ee",fontFamily:"'Segoe UI',Arial,sans-serif",fontSize:13}}>

      {/* ── DESKTOP TOP NAV ── */}
      {!mob && (
        <div style={{background:"#1a2f63",color:"white",height:46,display:"flex",alignItems:"center",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          <span style={{fontWeight:800,fontSize:14,padding:"0 16px",borderRight:"1px solid rgba(255,255,255,.15)",whiteSpace:"nowrap"}}>Control de Gestión</span>
          {NAV_TABS.map(t=>(
            <button key={t.n} onClick={()=>setPage(t.n)} style={{height:46,padding:"0 16px",background:"none",border:"none",borderBottom:`3px solid ${page===t.n?"white":"transparent"}`,color:page===t.n?"white":"rgba(255,255,255,.55)",fontWeight:700,fontSize:12.5,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
              {t.icon} {t.label}
            </button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,paddingRight:14}}>
            <SyncDot status={syncStatus}/>
            {/* ── Campana de notificaciones ── */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowNotifs(s=>!s)} style={{background:"none",border:"none",color:"white",cursor:"pointer",padding:"4px 6px",borderRadius:6,display:"flex",alignItems:"center",position:"relative"}}>
                <span style={{fontSize:18}}>🔔</span>
                {notifications.filter(n=>!n.read).length>0 && (
                  <span style={{position:"absolute",top:0,right:0,background:"#e34948",color:"white",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {notifications.filter(n=>!n.read).length}
                  </span>
                )}
              </button>
            </div>
            <Avatar uid={currentUser.id} size={26}/>
            <span style={{fontSize:11.5,opacity:.85}}>{currentUser.name.split(" ")[0]}</span>
            <span style={{fontSize:10,background:"rgba(255,255,255,.15)",padding:"2px 7px",borderRadius:10,color:"rgba(255,255,255,.75)"}}>{currentUser.role}</span>
            {currentUser.id==="leo" && <button onClick={resetData} style={{background:"rgba(255,60,60,.25)",border:"none",color:"white",fontSize:10,padding:"3px 8px",borderRadius:5,cursor:"pointer"}}>Reset</button>}
            <button onClick={()=>setCurrentUser(null)} style={{background:"rgba(255,255,255,.12)",border:"none",color:"white",fontSize:11,padding:"3px 9px",borderRadius:5,cursor:"pointer"}}>Salir</button>
          </div>
        </div>
      )}

      {/* ── MOBILE TOP BAR ── */}
      {mob && (
        <div style={{background:"#1a2f63",color:"white",height:50,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          <span style={{fontWeight:800,fontSize:13}}>Control de Gestión</span>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <SyncDot status={syncStatus}/>
            {/* Campana mobile */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowNotifs(s=>!s)} style={{background:"none",border:"none",color:"white",cursor:"pointer",padding:"4px 6px",display:"flex",alignItems:"center",position:"relative"}}>
                <span style={{fontSize:20}}>🔔</span>
                {notifications.filter(n=>!n.read).length>0 && (
                  <span style={{position:"absolute",top:0,right:0,background:"#e34948",color:"white",borderRadius:"50%",width:17,height:17,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {notifications.filter(n=>!n.read).length}
                  </span>
                )}
              </button>
            </div>
            <button onClick={()=>setMenuOpen(!menuOpen)} style={{background:"none",border:"none",color:"white",fontSize:11,padding:"4px 8px",borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
              <Avatar uid={currentUser.id} size={24}/>
              <span style={{fontSize:18,lineHeight:1}}>{menuOpen?"✕":"☰"}</span>
            </button>
          </div>
          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div style={{position:"absolute",top:50,right:0,left:0,background:"#132450",zIndex:200,padding:"8px 0",boxShadow:"0 4px 12px rgba(0,0,0,.3)"}}>
              <div style={{padding:"10px 16px",borderBottom:"1px solid rgba(255,255,255,.1)",fontSize:12,color:"rgba(255,255,255,.6)"}}>
                {currentUser.name} · <span style={{textTransform:"capitalize"}}>{currentUser.role}</span>
              </div>
              {currentUser.id==="leo" && <button onClick={()=>{resetData();setMenuOpen(false);}} style={{width:"100%",background:"none",border:"none",color:"#ff9999",fontSize:13,padding:"12px 16px",cursor:"pointer",textAlign:"left"}}>🔄 Resetear datos</button>}
              <button onClick={()=>{setCurrentUser(null);setMenuOpen(false);}} style={{width:"100%",background:"none",border:"none",color:"white",fontSize:13,padding:"12px 16px",cursor:"pointer",textAlign:"left"}}>← Salir</button>
            </div>
          )}
        </div>
      )}

      {/* PAGES */}
      {page===1 && (
        <CalendarPage
          tasks={tasks} comments={comments} currentUser={currentUser}
          selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
          monthTasks={monthTasks} filterType={filterType} setFilterType={setFilterType}
          filterResp={filterResp} setFilterResp={setFilterResp}
          showRutinas={showRutinas} setShowRutinas={setShowRutinas}
          dragSrc={dragSrc} setDragSrc={setDragSrc}
          dragOver={dragOver} setDragOver={setDragOver}
          dupTarget={dupTarget} setDupTarget={setDupTarget}
          onDrop={onDrop} handleDupClick={handleDupClick}
          addTask={addTask} setActiveTask={setActiveTask}
          showToast={showToast} toggleTaskStatus={toggleTaskStatus}
        />
      )}
      {page===2 && <PendientesPage currentUser={currentUser} pendientes={pendientes} setPendientes={setPendientes} tasks={tasks} setTasks={setTasks} persistTask={persistTask} notifyAssigned={notifyAssigned} notifyNewTask={notifyNewTask} selectedMonth={selectedMonth}/>}
      {page===3 && <TarjetasPage currentUser={currentUser}/>}
      {page===4 && <ReferenciaCombPage currentUser={currentUser} tasks={tasks}/>}

      {/* ── MOBILE BOTTOM NAV ── */}
      {mob && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:"1px solid #e0ddd8",display:"flex",zIndex:90,boxShadow:"0 -2px 12px rgba(0,0,0,.1)"}}>
          {NAV_TABS.map(t=>(
            <button key={t.n} onClick={()=>{setPage(t.n);setMenuOpen(false);}} style={{flex:1,padding:"8px 4px 10px",background:"none",border:"none",borderTop:`3px solid ${page===t.n?"#1a2f63":"transparent"}`,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:18}}>{t.icon}</span>
              <span style={{fontSize:9.5,fontWeight:700,color:page===t.n?"#1a2f63":"#aaa",letterSpacing:.03}}>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* TASK MODAL */}
      {activeTask && (
        <TaskModal
          task={tasks.find(t=>t.id===activeTask.id)||activeTask}
          comments={comments[activeTask.id]||[]}
          currentUser={currentUser}
          onClose={()=>setActiveTask(null)}
          onSave={saveTask}
          onDelete={deleteTask}
          onDuplicate={()=>{ setActiveTask(null); setDupTarget(activeTask.id); showToast("Toca el día destino para duplicar"); }}
          onAddComment={(txt)=>addComment(activeTask.id,txt)}
          canEdit={currentUser.role!=="viewer"}
        />
      )}

      {toast && <Toast msg={toast}/>}
      {lastError && (
        <div style={{position:"fixed",bottom:70,left:"50%",transform:"translateX(-50%)",background:"#8a2438",color:"white",padding:"10px 16px",borderRadius:8,fontSize:11.5,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,.3)",maxWidth:"90vw",lineHeight:1.5}}>
          <div style={{fontWeight:700,marginBottom:4}}>Error Supabase (para diagnóstico):</div>
          <div style={{fontFamily:"monospace",fontSize:10.5,wordBreak:"break-all"}}>{lastError}</div>
          <button onClick={()=>setLastError(null)} style={{marginTop:8,background:"rgba(255,255,255,.2)",border:"none",color:"white",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:11}}>Cerrar</button>
        </div>
      )}
      {/* Overlay para cerrar notificaciones */}
      {showNotifs && <div onClick={()=>setShowNotifs(false)} style={{position:"fixed",inset:0,zIndex:299,background:"rgba(0,0,0,.15)"}}/>}
      {/* Panel de notificaciones — funciona en desktop y mobile */}
      {showNotifs && (
        <NotifPanel
          notifs={notifications}
          currentUser={currentUser}
          onClose={()=>setShowNotifs(false)}
          onMarkRead={async(id)=>{ await db.markRead(id); setNotifications(prev=>prev.map(n=>n.id===id?{...n,read:true}:n)); }}
          onMarkAll={async()=>{ await db.markAllRead(currentUser.id); setNotifications(prev=>prev.map(n=>({...n,read:true}))); }}
        />
      )}
      {/* Widget de notas flotante */}
      {currentUser && <NotasWidget currentUser={currentUser}/>}
      <style dangerouslySetInnerHTML={{__html:`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#c0bbb0;border-radius:3px;}
        @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        input,select,textarea{font-size:16px !important;}
      `}}/>
    </div>
  );
}


// ─────────────────────────────────────────────
// MOBILE HOOK
// ─────────────────────────────────────────────
function useIsMobile() {
  const [mob, setMob] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}

// ─────────────────────────────────────────────
// PAGE 1 — CALENDAR (mobile-first)
// ─────────────────────────────────────────────
function CalendarPage({tasks,comments,currentUser,selectedMonth,setSelectedMonth,monthTasks,filterType,setFilterType,filterResp,setFilterResp,showRutinas,setShowRutinas,dragSrc,setDragSrc,dragOver,setDragOver,dupTarget,setDupTarget,onDrop,handleDupClick,addTask,setActiveTask,showToast,toggleTaskStatus}) {
  const mob = useIsMobile();
  const m = MONTHS.find(x=>x.num===selectedMonth);
  const workDays = getWorkDays(selectedMonth);
  const offset = getGridOffset(selectedMonth);
  const WDAYS = ["LUN","MAR","MIÉ","JUE","VIE"];

  // ── Fecha actual dinámica ──
  const NOW = new Date();
  const todayMonth = NOW.getMonth() + 1; // 1-12
  const todayDay   = NOW.getDate();
  const isCurrentMonth = selectedMonth === todayMonth;
  const bdays = BIRTHDAYS.filter(b=>b.month===selectedMonth);
  const [showFilters, setShowFilters] = useState(false);
  const [vistaMovil, setVistaMovil]   = useState("semana");
  const [weekIdx, setWeekIdx]         = useState(0);

  // Inicializar weekIdx en la semana actual al cambiar de mes
  useEffect(()=>{
    const allWork = getWorkDays(selectedMonth);
    const weeks = [];
    let week = [];
    allWork.forEach(d=>{
      const dow = getDOW(selectedMonth,d);
      if(dow===0 && week.length>0){ weeks.push(week); week=[]; }
      week.push(d);
    });
    if(week.length>0) weeks.push(week);
    const refDay = isCurrentMonth ? todayDay : allWork[0];
    const idx = Math.max(0, weeks.findIndex(w=>w.includes(refDay)));
    setWeekIdx(idx);
  },[selectedMonth]);

  const pad = mob ? "10px 12px 60px" : "14px 18px 40px";

  return (
    <div style={{padding:pad, maxWidth:1560, margin:"0 auto"}}>

      {/* Month selector — scrollable row on mobile */}
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:4,marginBottom:10}}>
        <div style={{display:"flex",gap:6,alignItems:"center",minWidth:"max-content"}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:.1,textTransform:"uppercase",color:"#5b5f6b",marginRight:4,flexShrink:0}}>Mes:</span>
          {MONTHS.map(mo=>{
            const isPast    = mo.num < todayMonth;
            const isCurrent = mo.num === todayMonth;
            const isSelected = selectedMonth === mo.num;
            return (
              <button key={mo.num} onClick={()=>setSelectedMonth(mo.num)}
                style={{
                  padding: mob?"6px 12px":"5px 14px",
                  borderRadius:20,
                  border:`2px solid ${isSelected?"#1a2f63":isPast?"#c8c4bc":"#dad6cc"}`,
                  background: isSelected?"#1a2f63": isPast?"#e8e5e0":"white",
                  color: isSelected?"white": isPast?"#999":"#5b5f6b",
                  fontWeight: isCurrent?800:700,
                  fontSize: mob?13:12,
                  cursor:"pointer",
                  flexShrink:0,
                  minHeight:mob?36:undefined,
                  opacity: isPast&&!isSelected?0.7:1,
                  position:"relative",
                }}>
                {mo.label}
                {isCurrent && !isSelected && (
                  <span style={{position:"absolute",top:-3,right:-3,width:8,height:8,borderRadius:"50%",background:"#e34948",border:"1.5px solid white"}}/>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Birthdays */}
      {bdays.length>0 && (
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {bdays.map(b=>{ const u=getUserById(b.uid); return (
            <span key={b.uid} style={{fontSize:11,display:"flex",alignItems:"center",gap:4,background:"#fde8f5",border:"1px solid #e8a0cc",borderRadius:20,padding:"3px 10px",color:"#a3265c",fontWeight:600}}>
              <Avatar uid={b.uid} size={14}/>🎂 {u?.name.split(" ")[0]} — {b.day}/{b.month}
            </span>
          );})}
        </div>
      )}

      {/* Filter bar — collapsible on mobile */}
      {mob ? (
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <button onClick={()=>setShowFilters(!showFilters)}
              style={{flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid #dad6cc",background:"white",fontSize:12.5,fontWeight:600,color:"#5b5f6b",display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
              ⚙️ Filtros {(filterType||filterResp)&&<span style={{background:"#8a2438",color:"white",borderRadius:10,padding:"0px 6px",fontSize:10}}>!</span>}
              <span style={{marginLeft:"auto",fontSize:12}}>{showFilters?"▲":"▼"}</span>
            </button>
            {!showRutinas && <Btn active={true} onClick={()=>setShowRutinas(true)}>+ Rutinas</Btn>}
            {showRutinas  && <Btn active={false} onClick={()=>setShowRutinas(false)}>- Rutinas</Btn>}
          </div>
          {showFilters && (
            <div style={{background:"white",border:"1px solid #dad6cc",borderRadius:8,padding:"12px",marginTop:6,display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>Tipo</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[{id:"repetitiva",label:"🔁 Recurrentes"},{id:"hito",label:"🔴 Hitos"}].map(f=>(
                    <Btn key={f.id} active={filterType===f.id} onClick={()=>setFilterType(filterType===f.id?null:f.id)}>{f.label}</Btn>
                  ))}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>Responsable</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {USERS.map(u=>(
                    <button key={u.id} onClick={()=>setFilterResp(filterResp===u.id?null:u.id)}
                      style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:20,border:`2px solid ${filterResp===u.id?u.color:"#dad6cc"}`,background:filterResp===u.id?u.color+"18":"white",cursor:"pointer",fontSize:12,fontWeight:600,color:filterResp===u.id?u.color:"#888",minHeight:36}}>
                      <Avatar uid={u.id} size={16}/>{u.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
              {(filterType||filterResp) && <button onClick={()=>{setFilterType(null);setFilterResp(null);setShowFilters(false);}} style={{fontSize:12,color:"#8a2438",background:"#f6e3e6",border:"none",cursor:"pointer",borderRadius:7,padding:"7px",fontWeight:600}}>✕ Limpiar filtros</button>}
            </div>
          )}
        </div>
      ) : (
        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:10,background:"white",borderRadius:8,padding:"8px 14px",border:"1px solid #dad6cc"}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:.1,textTransform:"uppercase",color:"#999",marginRight:4}}>Filtrar:</span>
          {/* Mis tareas — acceso rápido */}
          <button onClick={()=>setFilterResp(filterResp===currentUser.id?null:currentUser.id)}
            style={{display:"flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:20,
              border:`2px solid ${filterResp===currentUser.id?"#1a2f63":"#dad6cc"}`,
              background:filterResp===currentUser.id?"#1a2f63":"white",
              color:filterResp===currentUser.id?"white":"#555",
              cursor:"pointer",fontSize:11.5,fontWeight:700,transition:"all .12s"}}>
            <Avatar uid={currentUser.id} size={13}/>
            Mis tareas
          </button>
          <div style={{width:1,height:18,background:"#dad6cc",margin:"0 3px"}}/>
          {[{id:"repetitiva",label:"🔁 Recurrentes"},{id:"hito",label:"🔴 Hitos"}].map(f=>(
            <Btn key={f.id} active={filterType===f.id} onClick={()=>setFilterType(filterType===f.id?null:f.id)}>{f.label}</Btn>
          ))}
          <div style={{width:1,height:18,background:"#dad6cc",margin:"0 3px"}}/>
          {USERS.map(u=>(
            <button key={u.id} onClick={()=>setFilterResp(filterResp===u.id?null:u.id)}
              style={{display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:20,border:`2px solid ${filterResp===u.id?u.color:"#dad6cc"}`,background:filterResp===u.id?u.color+"18":"white",cursor:"pointer",fontSize:11,fontWeight:600,color:filterResp===u.id?u.color:"#888",transition:"all .12s"}}>
              <Avatar uid={u.id} size={13}/>{u.name.split(" ")[0]}
            </button>
          ))}
          <div style={{width:1,height:18,background:"#dad6cc",margin:"0 3px"}}/>
          <Btn active={!showRutinas} onClick={()=>setShowRutinas(!showRutinas)}>{showRutinas?"Ocultar rutinas":"Mostrar rutinas"}</Btn>
          {(filterType||filterResp) && <button onClick={()=>{setFilterType(null);setFilterResp(null);}} style={{fontSize:11,color:"#888",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>✕ Limpiar</button>}
          {dupTarget && <span style={{marginLeft:"auto",fontSize:11,color:"#8a2438",fontWeight:700,animation:"pulse 1s infinite"}}>📋 Clic en el día destino</span>}
        </div>
      )}

      {/* Month title + resumen equipo */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
        <div style={{fontFamily:"monospace",fontWeight:800,fontSize:mob?17:20,color:"#1a2f63",textTransform:"uppercase",letterSpacing:.5}}>{m?.label} 2026</div>
        {/* Contador por persona */}
        {!mob && (
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:10,color:"#aaa",fontWeight:600,marginRight:2}}>Tareas pendientes:</span>
            {USERS.map(u=>{
              const pending = tasks.filter(t=>t.month===selectedMonth && t.resp.includes(u.id) && t.type!=="rutina" && t.status!=="listo").length;
              if(pending===0) return null;
              return (
                <button key={u.id} onClick={()=>setFilterResp(filterResp===u.id?null:u.id)}
                  title={`${u.name}: ${pending} tarea${pending>1?"s":""} pendiente${pending>1?"s":""}`}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,
                    border:`2px solid ${filterResp===u.id?u.color:"#e0ddd8"}`,
                    background:filterResp===u.id?u.color+"18":"white",
                    cursor:"pointer",transition:"all .12s"}}>
                  <Avatar uid={u.id} size={16}/>
                  <span style={{fontFamily:"monospace",fontWeight:800,fontSize:12,color:u.color}}>{pending}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {dupTarget && mob && <div style={{fontSize:12,color:"#8a2438",fontWeight:700,animation:"pulse 1s infinite",marginBottom:8,padding:"8px 12px",background:"#f6e3e6",borderRadius:7}}>📋 Toca el día destino para duplicar</div>}

      {/* ── MOBILE: lista de días ── */}
      {mob ? (
        <div>
          {/* Toggle vista semanal / mensual */}
          <div style={{display:"flex",gap:0,marginBottom:10,background:"#f0ede8",borderRadius:10,padding:3}}>
            {[{id:"semana",label:"📅 Esta semana"},{id:"mes",label:"🗓 Todo el mes"}].map(v=>(
              <button key={v.id} onClick={()=>setVistaMovil(v.id)}
                style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",
                  background:vistaMovil===v.id?"white":"transparent",
                  color:vistaMovil===v.id?"#1a2f63":"#888",
                  fontWeight:700,fontSize:12.5,cursor:"pointer",
                  boxShadow:vistaMovil===v.id?"0 1px 4px rgba(0,0,0,.12)":"none",
                  transition:"all .15s"}}>
                {v.label}
              </button>
            ))}
          </div>

          {/* ── VISTA SEMANAL ── */}
          {vistaMovil==="semana" && (()=>{
            // Calcular semana actual (lun-vie) dentro del mes seleccionado
            const allWork = getWorkDays(selectedMonth);
            // Encontrar la semana que contiene hoy (o primera semana si no es mes actual)
            const refDay = isCurrentMonth ? todayDay : allWork[0];
            // Agrupar en semanas
            const weeks = [];
            let week = [];
            allWork.forEach(d=>{
              const dow = getDOW(selectedMonth,d);
              if(dow===0 && week.length>0){ weeks.push(week); week=[]; }
              week.push(d);
            });
            if(week.length>0) weeks.push(week);

            // Semana activa = la que contiene refDay
            const activeWeekIdx = Math.max(0, weeks.findIndex(w=>w.includes(refDay)));
            const currentWeek = weeks[weekIdx] || weeks[0] || [];
            const DOWLABELS = ["Lun","Mar","Mié","Jue","Vie"];

            return (
              <div>
                {/* Navegación de semanas */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <button onClick={()=>setWeekIdx(i=>Math.max(0,i-1))} disabled={weekIdx===0}
                    style={{background:"none",border:"1.5px solid #e0ddd8",borderRadius:8,padding:"6px 12px",
                      cursor:weekIdx===0?"not-allowed":"pointer",color:weekIdx===0?"#ccc":"#1a2f63",fontWeight:700,fontSize:16}}>
                    ‹
                  </button>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#1a2f63"}}>
                      Semana {weekIdx+1} de {weeks.length}
                    </div>
                    <div style={{fontSize:11,color:"#aaa"}}>
                      {currentWeek[0] && `${currentWeek[0]} – ${currentWeek[currentWeek.length-1]} ${MONTHS.find(m=>m.num===selectedMonth)?.label}`}
                    </div>
                  </div>
                  <button onClick={()=>setWeekIdx(i=>Math.min(weeks.length-1,i+1))} disabled={weekIdx===weeks.length-1}
                    style={{background:"none",border:"1.5px solid #e0ddd8",borderRadius:8,padding:"6px 12px",
                      cursor:weekIdx===weeks.length-1?"not-allowed":"pointer",color:weekIdx===weeks.length-1?"#ccc":"#1a2f63",fontWeight:700,fontSize:16}}>
                    ›
                  </button>
                </div>

                {/* Días de la semana */}
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {currentWeek.map(d=>{
                    const dow     = getDOW(selectedMonth,d);
                    const fer     = isFeriado(selectedMonth,d);
                    const isToday = isCurrentMonth && d===todayDay;
                    const isPast  = isCurrentMonth ? d<todayDay : selectedMonth<todayMonth;
                    const dTasks  = monthTasks(selectedMonth,d);
                    const isDupMode = !!dupTarget;
                    return (
                      <div key={d}
                        style={{
                          background: isToday?"#f0f4ff": fer?"#f0ede6": isPast?"#f5f3ee":"white",
                          border:`2px solid ${isToday?"#1a2f63":isPast?"#e0ddd8":"#e8e5e0"}`,
                          borderLeft:`5px solid ${dow===0?"#1d6b53":dow===1?"#1a2f63":isToday?"#1a2f63":"#e8e5e0"}`,
                          borderRadius:10, padding:"12px 14px",
                          opacity: isPast?0.7:1,
                          cursor:isDupMode?"crosshair":"default",
                        }}
                        onClick={()=>{ if(isDupMode) handleDupClick(d); }}>
                        {/* Header del día */}
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:dTasks.length>0?10:0}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                            <span style={{fontFamily:"monospace",fontWeight:800,fontSize:22,
                              color:isToday?"#1a2f63":isPast?"#aaa":"#272a33",lineHeight:1}}>
                              {d}
                            </span>
                            <span style={{fontSize:13,color:isToday?"#1a2f63":isPast?"#bbb":"#888",fontWeight:600}}>
                              {DOWLABELS[dow]}
                            </span>
                          </div>
                          {isToday && <span style={{fontSize:10,background:"#1a2f63",color:"white",borderRadius:8,padding:"2px 8px",fontWeight:700}}>HOY</span>}
                          {isPast  && <span style={{fontSize:10,background:"#e8e5e0",color:"#999",borderRadius:8,padding:"2px 8px",fontWeight:600}}>pasado</span>}
                          {fer && <span style={{fontSize:11,color:"#b9711b",fontWeight:600,marginLeft:4}}>🎌 {fer.label}</span>}
                          {!fer && !isPast && currentUser.role!=="viewer" && (
                            <button onClick={e=>{e.stopPropagation();addTask(d);}}
                              style={{marginLeft:"auto",background:"#1a2f63",border:"none",borderRadius:8,
                                width:32,height:32,cursor:"pointer",fontSize:20,color:"white",
                                display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
                              +
                            </button>
                          )}
                        </div>
                        {/* Tareas del día */}
                        {dTasks.length>0 ? (
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            {dTasks.map(task=>(
                              <TaskChipMobile key={task.id} task={task}
                                hasComment={!!(comments[task.id]?.length)}
                                onClick={e=>{e.stopPropagation();if(!dupTarget)setActiveTask(task);}}
                                onToggleStatus={toggleTaskStatus}/>
                            ))}
                          </div>
                        ) : (
                          <div style={{fontSize:12,color:"#ccc",fontStyle:"italic",marginTop:4}}>Sin tareas</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── VISTA MENSUAL MOBILE ── */}
          {vistaMovil==="mes" && (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {/* Bloque pasados */}
              {isCurrentMonth && workDays.some(d=>d<todayDay) && (
                <PastDaysBlock
                  days={workDays.filter(d=>d<todayDay)}
                  month={selectedMonth} monthTasks={monthTasks}
                  comments={comments} currentUser={currentUser}
                  setActiveTask={setActiveTask} dupTarget={dupTarget}
                  handleDupClick={handleDupClick}/>
              )}
              {/* Separadores de semana */}
              {(()=>{
                const DOWLABELS = ["Lun","Mar","Mié","Jue","Vie"];
                const days = workDays.filter(d=> isCurrentMonth ? d>=todayDay : true);
                const result = [];
                let lastDow = -1;
                days.forEach(d=>{
                  const dow = getDOW(selectedMonth,d);
                  // Separador de semana
                  if(dow <= lastDow) {
                    result.push(<div key={`sep-${d}`} style={{height:4,background:"#f0ede8",borderRadius:4,margin:"4px 0"}}/>);
                  }
                  lastDow = dow;
                  const fer     = isFeriado(selectedMonth,d);
                  const isToday = isCurrentMonth && d===todayDay;
                  const dTasks  = monthTasks(selectedMonth,d);
                  const isDupMode = !!dupTarget;
                  if(dTasks.length===0 && !isToday && !fer) return;
                  result.push(
                    <div key={d}
                      style={{
                        background: fer?"#f0ede6":dow===1?"#f0f4ff":"white",
                        border:`1.5px solid ${isToday?"#1a2f63":"#e8e5e0"}`,
                        borderLeft:`4px solid ${dow===0?"#1d6b53":dow===1?"#1a2f63":isToday?"#1a2f63":"#e8e5e0"}`,
                        borderRadius:8, padding:"9px 12px",
                        cursor:isDupMode?"crosshair":"default",
                        boxShadow:isToday?"0 0 0 2px #1a2f6330":undefined,
                      }}
                      onClick={()=>{ if(isDupMode) handleDupClick(d); }}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:dTasks.length>0?6:0}}>
                        <span style={{fontFamily:"monospace",fontWeight:800,fontSize:14,
                          color:isToday?"#1a2f63":"#272a33",minWidth:20}}>{d}</span>
                        <span style={{fontSize:11,color:"#aaa",fontWeight:600}}>{DOWLABELS[dow]}</span>
                        {isToday && <span style={{fontSize:9,background:"#1a2f63",color:"white",borderRadius:8,padding:"1px 6px",fontWeight:700}}>HOY</span>}
                        {fer && <span style={{fontSize:10,color:"#888",fontStyle:"italic"}}>{fer.label}</span>}
                        {!fer && currentUser.role!=="viewer" && (
                          <button onClick={e=>{e.stopPropagation();addTask(d);}}
                            style={{marginLeft:"auto",background:"none",border:"1px dashed #ccc",borderRadius:5,
                              width:24,height:24,cursor:"pointer",fontSize:15,color:"#ccc",
                              display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>+</button>
                        )}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {dTasks.map(task=>(
                          <TaskChipMobile key={task.id} task={task}
                            hasComment={!!(comments[task.id]?.length)}
                            onClick={e=>{e.stopPropagation();if(!dupTarget)setActiveTask(task);}}
                            onToggleStatus={toggleTaskStatus}/>
                        ))}
                      </div>
                    </div>
                  );
                });
                return result;
              })()}
            </div>
          )}
        </div>
      ) : (
        /* ── DESKTOP: grid 5 columnas ── */
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:6}}>
            {WDAYS.map((w,i)=>{
              const isToday = isCurrentMonth && getDOW(selectedMonth, todayDay)===i;
              return (
                <div key={w} style={{textAlign:"center",fontFamily:"monospace",fontSize:10.5,fontWeight:700,
                  letterSpacing:.1,textTransform:"uppercase",
                  color:isToday?"#1a2f63":i===0?"#1d6b53":i===1?"#1a2f63":"#5b5f6b",
                  borderBottom:`2.5px solid ${isToday?"#1a2f63":"transparent"}`,
                  paddingBottom:2}}>
                  {w}
                </div>
              );
            })}
          </div>

          {/* ── Banner cierre activo ── */}
          {(()=>{
            const allCierres = [...(typeof CIERRES_PASADOS!=="undefined"?CIERRES_PASADOS:[]),...CIERRES];
            if(selectedMonth!==todayMonth) return null;
            const cierreActivo = allCierres.find(c=>
              [...c.descarga,...c.carga].some(d=>{
                const parts=d.split(' ')[1]?.split('/');
                return parts && parseInt(parts[0])===todayDay && parseInt(parts[1])===todayMonth;
              })
            );
            if(!cierreActivo) return null;
            const enDescarga = cierreActivo.descarga.some(d=>{const p=d.split(' ')[1]?.split('/');return p&&parseInt(p[0])===todayDay&&parseInt(p[1])===todayMonth;});
            const fase = enDescarga
              ? {label:"🔵 Hoy: Fase de Descarga y Proyección",bg:"#1a2f63",desc:`Cierre ${cierreActivo.mes} · Corte: ${cierreActivo.corteFin}`}
              : {label:"🟢 Hoy: Fase de Carga y Reversa",bg:"#1d6b53",desc:`Cierre ${cierreActivo.mes}`};
            return (
              <div style={{background:fase.bg,color:"white",borderRadius:8,padding:"9px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontWeight:800,fontSize:13}}>{fase.label}</span>
                <span style={{opacity:.75,fontSize:11}}>{fase.desc}</span>
                <button onClick={()=>setPage(4)}
                  style={{marginLeft:"auto",background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.35)",
                    color:"white",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
                  Ver calendario de cierre →
                </button>
              </div>
            );
          })()}

          {/* ── Bloque días pasados colapsado ── */}
          {isCurrentMonth && workDays.some(d=>d<todayDay) && (
            <PastDaysBlock
              days={workDays.filter(d=>d<todayDay)}
              month={selectedMonth}
              monthTasks={monthTasks}
              comments={comments}
              currentUser={currentUser}
              setActiveTask={setActiveTask}
              dupTarget={dupTarget}
              handleDupClick={handleDupClick}
            />
          )}

          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
            {/* offset vacío solo para el primer día hábil del mes cuando no hay pasados */}
            {(!isCurrentMonth || !workDays.some(d=>d<todayDay)) && Array.from({length:offset}).map((_,i)=><div key={"e"+i}/>)}
            {/* Si hay pasados, el offset ya lo maneja PastDaysBlock visualmente — el grid empieza en HOY */}
            {workDays.filter(d=> isCurrentMonth ? d>=todayDay : true).map((d,idx)=>{
              // Si hay días pasados agrupados, agregar celdas vacías para posicionar HOY correctamente
              const needsOffset = isCurrentMonth && workDays.some(d2=>d2<todayDay) && idx===0;
              const todayOffset = needsOffset ? getDOW(selectedMonth, d) : 0;
              const emptyBefore = needsOffset ? Array.from({length:todayOffset}) : [];
              const dow  = getDOW(selectedMonth,d);
              const fer  = isFeriado(selectedMonth,d);
              const isToday = isCurrentMonth && d === todayDay;
              const isPast  = isCurrentMonth ? d < todayDay : selectedMonth < todayMonth;
              const dTasks = monthTasks(selectedMonth,d);
              const isDropOver = dragOver===`${selectedMonth}-${d}`;
              const isDupMode  = !!dupTarget;
              return (
                <>
                  {emptyBefore.map((_,i)=><div key={`off${i}`}/>)}
                  <div key={d}
                  style={{
                    background: isPast?"#edecea": fer?"#f0ede6":dow===1?"#dfe7f7":"white",
                    border:`1.5px solid ${isDropOver?"#3b4d8c":isToday?"#1a2f63":isPast?"#d8d5d0":"#dad6cc"}`,
                    borderLeft:dow===0?`3px solid ${isPast?"#b0aea8":"#1d6b53"}`:undefined,
                    borderRadius:7,minHeight:118,padding:"6px 7px 7px",display:"flex",flexDirection:"column",
                    transition:"all .12s",cursor:isDupMode?"crosshair":"default",
                    boxShadow:isToday?"0 0 0 2px #1a2f6340":isDropOver?"0 0 0 2px #3b4d8c40":undefined,
                    opacity: isPast?0.6:1,
                  }}
                  onDragOver={e=>{e.preventDefault();setDragOver(`${selectedMonth}-${d}`);}}
                  onDrop={e=>onDrop(e,d)}
                  onDragLeave={()=>setDragOver(null)}
                  onClick={()=>{ if(isDupMode) handleDupClick(d); }}
                >
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:isToday?"#1a2f63":isPast?"#999":dow===1?"#1a2f63":"#272a33"}}>
                      {d}
                      {isToday && <span style={{fontSize:8,background:"#1a2f63",color:"white",borderRadius:8,padding:"1px 5px",marginLeft:4,fontWeight:700}}>HOY</span>}
                      {isPast  && <span style={{fontSize:7.5,background:"#ccc",color:"#777",borderRadius:8,padding:"1px 5px",marginLeft:4,fontWeight:600}}>pasado</span>}
                    </span>
                    {fer && <span style={{fontSize:8,color:"#888",fontStyle:"italic"}}>{fer.label.split(" ").slice(0,2).join(" ")}</span>}
                    {!fer && currentUser.role!=="viewer" && (
                      <button onClick={e=>{e.stopPropagation();addTask(d);}} style={{background:"none",border:"1px dashed #bbb",borderRadius:4,width:17,height:17,cursor:"pointer",fontSize:13,color:"#bbb",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>+</button>
                    )}
                  </div>
                  {fer && <span style={{fontSize:9,color:"#888",fontStyle:"italic",display:"block",marginBottom:3}}>{fer.label}</span>}
                  <div style={{display:"flex",flexDirection:"column",gap:2,flex:1}}>
                    {dTasks.map(task=>(
                      <TaskChip key={task.id} task={task} hasComment={!!(comments[task.id]?.length)}
                        draggable={currentUser.role!=="viewer"&&!task.fixed}
                        onDragStart={()=>setDragSrc(task.id)}
                        onDragEnd={()=>{setDragSrc(null);setDragOver(null);}}
                        onClick={e=>{e.stopPropagation();if(!dupTarget)setActiveTask(task);}}
                        onToggleStatus={toggleTaskStatus}
                      />
                    ))}
                  </div>
                </div>
                </>
              );
            })}
          </div>
        </>
      )}

      {/* Legend */}
      {!mob && (
        <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:7,padding:"9px 13px",background:"white",borderRadius:8,border:"1px solid #dad6cc",fontSize:10.5}}>
          {TASK_TYPES.filter(t=>t.id!=="otro").map(t=>(
            <span key={t.id} style={{display:"flex",alignItems:"center",gap:4,fontWeight:600,color:"#5b5f6b"}}>
              <span style={{width:9,height:9,borderRadius:2,background:t.bg,border:`1px solid ${t.fg==="white"?t.bg:"#ccc"}`,display:"inline-block",flexShrink:0}}/>{t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE 4 — ROADMAP · CIERRE · ICEO (combinada)
// ─────────────────────────────────────────────
function ReferenciaCombPage({currentUser, tasks=[]}) {
  const mob = useIsMobile();
  const [subTab, setSubTab] = useState("roadmap");
  const TABS = [
    {id:"roadmap", icon:"🗺️", label:"Roadmap"},
    {id:"cierre",  icon:"🔒", label:"Cierre Mes"},
    {id:"iceo",    icon:"📋", label:"ICEO + PM"},
  ];
  return (
    <div style={{minHeight:"60vh"}}>
      <div style={{background:"white",borderBottom:"1px solid #e0ddd8",padding:mob?"0 12px":"0 24px",display:"flex",gap:0,position:"sticky",top:mob?50:46,zIndex:90}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            style={{padding:mob?"10px 14px":"10px 20px",background:"none",border:"none",
              borderBottom:`3px solid ${subTab===t.id?"#1a2f63":"transparent"}`,
              color:subTab===t.id?"#1a2f63":"#888",fontWeight:700,
              fontSize:mob?12:13,cursor:"pointer",display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {subTab==="roadmap" && <RoadmapPage tasks={tasks}/>}
      {subTab==="cierre"  && <CierreMesPage currentUser={currentUser}/>}
      {subTab==="iceo"    && <IceoPage/>}
    </div>
  );
}


function RoadmapPage({tasks=[]}) {
  const mob = useIsMobile();
  const [showPast, setShowPast] = useState(false);
  const [showSectionPasts, setShowSectionPasts] = useState({});
  const [showCalHitos, setShowCalHitos] = useState(true);
  const NOW = new Date();
  const todayMonth = NOW.getMonth()+1;
  const todayDay   = NOW.getDate();

  // Hitos agregados desde el calendario
  const MESES_NOM = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const calHitos = tasks
    .filter(t=>t.type==="hito" && !t.fixed)
    .sort((a,b)=>a.month-b.month||a.day-b.day)
    .map(t=>({
      id:t.id, title:t.title, monthNum:t.month, day:t.day,
      date:`${t.day} ${MESES_NOM[t.month]}`,
      resp:t.resp, status:t.status,
    }));

  const isPastItem = (item) => {
    if(item.monthNum < todayMonth) return true;
    if(item.monthNum === todayMonth && item.day < todayDay) return true;
    return false;
  };
  const isSectionAllPast = (section) => section.items.every(item=>isPastItem(item));

  const pastSections  = ROADMAP.filter(s=>isSectionAllPast(s));
  const activeSections = ROADMAP.filter(s=>!isSectionAllPast(s));

  const renderItem = (item, ii) => {
    const past = isPastItem(item);
    return (
      <div key={ii} style={{display:"flex",gap:8,alignItems:"flex-start",
        background:past?"#f0ede8":item.span?"#f0ebfa":"#fafaf8",
        border:`1px solid ${past?"#e0dbd4":item.span?"#d8c9ef":"#ebebeb"}`,
        borderRadius:7,padding:mob?"8px 10px":"9px 12px",
        opacity:past?0.65:1,
      }}>
        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:9.5,color:past?"#aaa":"white",
          background:past?"#ddd":item.bg,
          borderRadius:5,padding:"3px 6px",whiteSpace:"nowrap",flexShrink:0,height:"fit-content",marginTop:1,
          textDecoration:past?"line-through":undefined,
        }}>{item.date}</span>
        <div>
          <div style={{fontWeight:700,fontSize:mob?12:12.5,
            color:past?"#aaa":item.span?"#5b3f8c":"#1a2f63",
            textDecoration:past?"line-through":undefined,
            marginBottom:item.desc?2:0}}>{item.label}</div>
          {item.desc && !past && <div style={{fontSize:10.5,color:"#777",lineHeight:1.4}}>{item.desc}</div>}
        </div>
        {past && <span style={{marginLeft:"auto",flexShrink:0,fontSize:9,background:"#e8e5e0",color:"#aaa",borderRadius:10,padding:"1px 7px",fontWeight:700,height:"fit-content",marginTop:2}}>realizado</span>}
      </div>
    );
  };

  return (
    <div style={{padding:mob?"12px 12px 70px":"24px 32px 60px",maxWidth:1200,margin:"0 auto"}}>
      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:5}}>Control de Gestión · Visión hacia adelante</div>
      <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63",marginBottom:4}}>Roadmap <span style={{color:"#8a2438"}}>Jul – Dic 2026</span></div>
      <div style={{fontSize:12,color:"#5b5f6b",marginBottom:16}}>Hitos relevantes del segundo semestre.</div>

      {/* Hitos desde el calendario */}
      {calHitos.length>0 && (
        <div style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",overflow:"hidden",marginBottom:16}}>
          <button onClick={()=>setShowCalHitos(s=>!s)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"11px 16px",background:"#1a2f63",border:"none",cursor:"pointer",textAlign:"left"}}>
            <span style={{fontSize:13,fontWeight:800,color:"white"}}>🔴 Hitos desde el calendario</span>
            <span style={{marginLeft:"auto",fontSize:11,color:"rgba(255,255,255,.7)"}}>{calHitos.length} hitos · {showCalHitos?"Colapsar":"Ver"}</span>
          </button>
          {showCalHitos && (
            <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
              {calHitos.map(h=>{
                const past = h.monthNum<todayMonth||(h.monthNum===todayMonth&&h.day<todayDay);
                return (
                  <div key={h.id} style={{display:"flex",gap:8,alignItems:"center",background:past?"#f5f3ee":"#fafaf8",border:"1px solid #ebebeb",borderRadius:7,padding:"8px 12px",opacity:past?0.6:1}}>
                    <span style={{fontFamily:"monospace",fontWeight:700,fontSize:10,color:"white",background:past?"#aaa":"#8a2438",borderRadius:5,padding:"3px 7px",whiteSpace:"nowrap",flexShrink:0}}>{h.date}</span>
                    <span style={{fontSize:12.5,fontWeight:600,color:"#272a33",flex:1,lineHeight:1.3,textDecoration:past?"line-through":undefined}}>{h.title.replace("⚠️ ","")}</span>
                    {h.resp&&h.resp.length>0&&<div style={{display:"flex",gap:2}}>{h.resp.slice(0,3).map(uid=><Avatar key={uid} uid={uid} size={16}/>)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hitos pasados colapsados */}
      {pastSections.length>0 && (
        <div style={{marginBottom:16}}>
          <button onClick={()=>setShowPast(s=>!s)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:"#edecea",border:"1px solid #d0cdc8",borderRadius:showPast?"8px 8px 0 0":8,cursor:"pointer",textAlign:"left"}}>
            <span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:"#888"}}>{showPast?"▲":"▼"}</span>
            <span style={{fontSize:12.5,fontWeight:700,color:"#888"}}>
              Hitos pasados ({pastSections.map(s=>s.month).join(", ")})
            </span>
            <span style={{marginLeft:"auto",fontSize:11,color:"#aaa"}}>
              {pastSections.reduce((a,s)=>a+s.items.length,0)} hitos realizados
            </span>
            <span style={{fontSize:11,background:"#ccc",color:"#666",borderRadius:10,padding:"1px 8px",fontWeight:700}}>
              {showPast?"Colapsar":"Ver detalle"}
            </span>
          </button>
          {showPast && (
            <div style={{border:"1px solid #d0cdc8",borderTop:"none",borderRadius:"0 0 8px 8px",background:"#f8f6f2",padding:mob?"10px":"12px",display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:mob?10:16}}>
              {pastSections.map((section,si)=>(
                <div key={si} style={{background:"white",borderRadius:8,border:"1px solid #e0ddd8",overflow:"hidden",opacity:.8}}>
                  <div style={{background:"#aaa",color:"white",padding:"7px 12px",fontFamily:"monospace",fontWeight:700,fontSize:mob?10:11,letterSpacing:.1,textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
                    ✓ {section.month}
                  </div>
                  <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:6}}>
                    {section.items.map((item,ii)=>renderItem(item,ii))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Secciones activas y futuras */}
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:mob?12:20}}>
        {activeSections.map((section,si)=>{
          const pastItems   = section.items.filter(item=>isPastItem(item));
          const activeItems = section.items.filter(item=>!isPastItem(item));
          const showSectionPast = !!showSectionPasts[si];
          return (
            <div key={si} style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",overflow:"hidden"}}>
              <div style={{background:section.color,color:"white",padding:"9px 14px",fontFamily:"monospace",fontWeight:700,fontSize:mob?11:12,letterSpacing:.1,textTransform:"uppercase"}}>
                ● {section.month}
              </div>
              <div style={{padding:mob?"10px":"12px 14px",display:"flex",flexDirection:"column",gap:7}}>
                {pastItems.length>0 && (
                  <div>
                    <button onClick={()=>setShowSectionPasts(s=>({...s,[si]:!s[si]}))}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:"#f0ede8",border:"1px solid #ddd",borderRadius:6,cursor:"pointer",fontSize:11,color:"#aaa",fontWeight:700}}>
                      <span>{showSectionPast?"▲":"▼"}</span>
                      <span>{pastItems.length} hito{pastItems.length>1?"s":""} pasado{pastItems.length>1?"s":""}</span>
                      <span style={{marginLeft:"auto",fontSize:10}}>{showSectionPast?"ocultar":"ver"}</span>
                    </button>
                    {showSectionPast && (
                      <div style={{display:"flex",flexDirection:"column",gap:5,marginTop:5}}>
                        {pastItems.map((item,ii)=>renderItem(item,ii))}
                      </div>
                    )}
                  </div>
                )}
                {activeItems.map((item,ii)=>renderItem(item,ii))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:14,fontSize:11,color:"#aaa",textAlign:"right",fontFamily:"monospace"}}>Control de Gestión · v4</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE 3 — PENDIENTES (interactivo)
// ─────────────────────────────────────────────
const STATUS_CONFIG = {
  "por iniciar": {bg:"#f6e3e6", color:"#8a2438", border:"#d4a0a8"},
  "en ajuste":   {bg:"#f7ead4", color:"#b9711b", border:"#e0c080"},
  "listo":       {bg:"#e4f0ea", color:"#1d6b53", border:"#a0d0b0"},
  "no válido":   {bg:"#e8e8e8", color:"#888",    border:"#ccc"},
};
const STATUS_OPTIONS = ["por iniciar","en ajuste","listo","no válido"];

function PendientesPage({currentUser, pendientes, setPendientes, tasks, setTasks, persistTask, notifyAssigned, notifyNewTask, selectedMonth}) {
  const mob = useIsMobile();
  const [editId, setEditId]   = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newItem, setNewItem] = useState({label:"",status:"por iniciar",resp:[],fecha:"",urgencia:2,importancia:2});
  const [saving, setSaving]   = useState(false);
  const [vista, setVista]     = useState("lista"); // lista | matriz

  const ACTIVOS_STATUS = ["por iniciar","en ajuste","en proceso"];
  const INACTIVOS_STATUS = ["listo","no válido"];

  // Ordenar: activos primero (por puntaje desc), luego inactivos al final
  const sortedPendientes = [...pendientes].sort((a,b) => {
    const aActivo = ACTIVOS_STATUS.includes(a.status);
    const bActivo = ACTIVOS_STATUS.includes(b.status);
    if(aActivo && !bActivo) return -1;
    if(!aActivo && bActivo) return 1;
    // Dentro de activos: ordenar por puntaje (urgencia * importancia) desc
    const scoreA = (a.urgencia||2) * (a.importancia||2);
    const scoreB = (b.urgencia||2) * (b.importancia||2);
    return scoreB - scoreA;
  });

  async function saveEdit(id) {
    const p = pendientes.find(x=>x.id===id);
    if(!p) return;
    setSaving(true);
    try { await db.upsertPendiente(p); } catch(e){console.error(e);}
    setSaving(false);
    setEditId(null);
  }

  async function addNew() {
    if(!newItem.label.trim()) return;
    const p = {...newItem, id:`p${Date.now()}`, created_by:currentUser?.id||null};
    setSaving(true);
    try {
      await db.upsertPendiente(p);
      setPendientes(prev=>[...prev,p]);
      if(newItem.fecha) {
        const [year, month, day] = newItem.fecha.split('-').map(Number);
        const newTask = {id:`t_pend_${Date.now()}`,month,day,type:"hito",title:`⚠️ ${newItem.label}`,resp:newItem.resp,notes:`Pendiente estratégico`,fixed:false,status:"pendiente"};
        if(setTasks) setTasks(prev=>[...prev,newTask]);
        if(persistTask) await persistTask(newTask);
      }
      if(newItem.resp.length>0) {
        for(const uid of newItem.resp) {
          if(uid!==currentUser?.id) {
            await db.addNotification({user_id:uid,type:"asignado",message:`${USERS.find(u=>u.id===currentUser?.id)?.name||"Alguien"} te asignó al pendiente: "${newItem.label}"`,task_id:p.id,task_title:newItem.label,created_by:currentUser?.id||null,read:false});
          }
        }
      }
    } catch(e){console.error(e);}
    setSaving(false);
    setNewItem({label:"",status:"por iniciar",resp:[],fecha:"",urgencia:2,importancia:2});
    setShowNew(false);
  }

  async function deleteItem(id) {
    if(!window.confirm("¿Eliminar este pendiente?")) return;
    try { await db.deletePendiente(id); setPendientes(prev=>prev.filter(p=>p.id!==id)); } catch(e){console.error(e);}
  }

  const statusBadge = (status) => {
    const c = STATUS_CONFIG[status] || STATUS_CONFIG["por iniciar"];
    return <span style={{fontFamily:"monospace",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.05,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap",flexShrink:0,background:c.bg,color:c.color,border:`1px solid ${c.border}`,textDecoration:status==="no válido"?"line-through":undefined}}>{status}</span>;
  };

  const ScoreBtn = ({val, current, onClick, color}) => (
    <button onClick={onClick} style={{width:mob?32:26,height:mob?32:26,borderRadius:6,border:`2px solid ${current===val?color:"#e0e0e0"}`,background:current===val?color:"white",color:current===val?"white":"#888",fontWeight:800,fontSize:mob?13:11,cursor:"pointer"}}>
      {val}
    </button>
  );

  // Vista de matriz 2D (Urgencia x Importancia)
  const MatrizView = () => {
    const activos = pendientes.filter(p=>ACTIVOS_STATUS.includes(p.status));
    // Crear cuadrícula 3x3
    const celdas = {};
    for(let u=1;u<=3;u++) for(let i=1;i<=3;i++) celdas[`${u}-${i}`]=[];
    activos.forEach(p=>{
      const key = `${p.urgencia||2}-${p.importancia||2}`;
      if(celdas[key]) celdas[key].push(p);
    });
    const getBg = (u,i) => {
      const score = u*i;
      if(score>=6) return "#fff0f0"; // alto
      if(score>=4) return "#fffbe6"; // medio
      return "#f0f8f0"; // bajo
    };
    return (
      <div style={{overflowX:"auto"}}>
        <div style={{fontSize:11,color:"#aaa",marginBottom:8,textAlign:"center"}}>Urgencia (eje X) × Importancia (eje Y)</div>
        <div style={{display:"grid",gridTemplateColumns:"60px 1fr 1fr 1fr",gap:4,minWidth:340}}>
          {/* Headers */}
          <div/>
          {[1,2,3].map(u=>(
            <div key={u} style={{textAlign:"center",fontFamily:"monospace",fontWeight:700,fontSize:11,color:"#1a2f63",padding:"6px 0",background:"#f0f4ff",borderRadius:6}}>
              U={u}
            </div>
          ))}
          {/* Filas */}
          {[3,2,1].map(i=>(
            <>
              <div key={`label-${i}`} style={{display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontWeight:700,fontSize:11,color:"#1a2f63",background:"#f0f4ff",borderRadius:6}}>I={i}</div>
              {[1,2,3].map(u=>{
                const items = celdas[`${u}-${i}`];
                const bg = getBg(u,i);
                return (
                  <div key={`${u}-${i}`} style={{background:bg,borderRadius:8,padding:6,minHeight:60,border:"1px solid #e8e5e0"}}>
                    {items.map(p=>(
                      <div key={p.id} style={{fontSize:10,background:"white",borderRadius:5,padding:"3px 6px",marginBottom:3,lineHeight:1.3,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
                        {p.label}
                      </div>
                    ))}
                    {items.length===0 && <div style={{color:"#ddd",fontSize:9,textAlign:"center",marginTop:8}}>—</div>}
                  </div>
                );
              })}
            </>
          ))}
        </div>
        <div style={{display:"flex",gap:10,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
          {[{bg:"#fff0f0",label:"Alta prioridad (U×I ≥ 6)"},{bg:"#fffbe6",label:"Media prioridad"},{bg:"#f0f8f0",label:"Baja prioridad"}].map(l=>(
            <div key={l.bg} style={{display:"flex",alignItems:"center",gap:5,fontSize:10.5,color:"#666"}}>
              <span style={{width:12,height:12,borderRadius:3,background:l.bg,border:"1px solid #ddd",display:"inline-block"}}/>
              {l.label}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{padding:mob?"12px 12px 70px":"24px 32px 60px",maxWidth:900,margin:"0 auto"}}>
      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:5}}>Control de Gestión</div>
      <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63",marginBottom:4}}>⚠️ Pendientes <span style={{color:"#8a2438"}}>estratégicos</span></div>
      <div style={{fontSize:12,color:"#5b5f6b",marginBottom:12}}>Todos pueden agregar y editar. Los cambios se guardan en tiempo real.</div>

      {/* Toggle lista/matriz */}
      <div style={{display:"flex",gap:0,marginBottom:14,background:"#f0ede8",borderRadius:10,padding:3,maxWidth:300}}>
        {[{id:"lista",label:"📋 Lista"},{id:"matriz",label:"📊 Matriz 2D"}].map(v=>(
          <button key={v.id} onClick={()=>setVista(v.id)}
            style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",background:vista===v.id?"white":"transparent",
              color:vista===v.id?"#1a2f63":"#888",fontWeight:700,fontSize:12.5,cursor:"pointer",
              boxShadow:vista===v.id?"0 1px 4px rgba(0,0,0,.12)":"none",transition:"all .15s"}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Matriz 2D */}
      {vista==="matriz" && (
        <div style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",padding:"16px 18px",marginBottom:16}}>
          <MatrizView/>
        </div>
      )}

      {/* Lista */}
      {vista==="lista" && (
        <div style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",overflow:"hidden",marginBottom:16}}>
          <div style={{background:"#1a2f63",color:"white",padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:800,fontSize:mob?13:14}}>📋 Listado ({pendientes.length})</span>
            <button onClick={()=>setShowNew(true)} style={{background:"rgba(255,255,255,.2)",border:"1px solid rgba(255,255,255,.3)",color:"white",borderRadius:7,padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nuevo</button>
          </div>

          {sortedPendientes.length===0 && !showNew && <div style={{padding:"24px",textAlign:"center",color:"#aaa",fontSize:13}}>Sin pendientes.</div>}

          {sortedPendientes.map((p,i)=>{
            const isInactivo = INACTIVOS_STATUS.includes(p.status);
            return (
              <div key={p.id} style={{borderBottom:i<sortedPendientes.length-1?"1px dashed #ebebeb":undefined,
                background:i%2===0?"#fafaf8":"white",
                opacity:isInactivo?0.5:1,
                filter:isInactivo?"grayscale(0.3)":"none",
                transition:"opacity .2s"}}>
                {editId===p.id ? (
                  <div style={{padding:"12px 16px",display:"flex",flexDirection:"column",gap:10}}>
                    <input value={p.label} onChange={e=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,label:e.target.value}:x))}
                      style={{width:"100%",padding:"7px 10px",border:"1.5px solid #c0d0f0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/>
                    <div>
                      <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Fecha límite</div>
                      <input type="date" value={p.fecha||""} onChange={e=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,fecha:e.target.value}:x))}
                        style={{padding:"7px 10px",border:"1.5px solid #c0d0f0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none",width:mob?"100%":"auto"}}/>
                    </div>
                    {/* Urgencia */}
                    <div>
                      <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Urgencia (1=baja, 3=alta)</div>
                      <div style={{display:"flex",gap:6}}>
                        {[1,2,3].map(v=><ScoreBtn key={v} val={v} current={p.urgencia||2} color="#e34948" onClick={()=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,urgencia:v}:x))}/>)}
                      </div>
                    </div>
                    {/* Importancia */}
                    <div>
                      <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Importancia (1=baja, 3=alta)</div>
                      <div style={{display:"flex",gap:6}}>
                        {[1,2,3].map(v=><ScoreBtn key={v} val={v} current={p.importancia||2} color="#1a2f63" onClick={()=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,importancia:v}:x))}/>)}
                      </div>
                    </div>
                    {/* Estado */}
                    <div>
                      <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Estado</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {STATUS_OPTIONS.map(s=>{ const c=STATUS_CONFIG[s]; return (
                          <button key={s} onClick={()=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,status:s}:x))}
                            style={{padding:mob?"6px 11px":"3px 10px",borderRadius:20,border:`2px solid ${p.status===s?c.color:"#e0e0e0"}`,background:p.status===s?c.bg:"white",color:p.status===s?c.color:"#888",fontSize:mob?12:11,fontWeight:700,cursor:"pointer",minHeight:mob?34:undefined}}>
                            {s}
                          </button>
                        );})}
                      </div>
                    </div>
                    {/* Responsables */}
                    <div>
                      <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Responsables</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                        {USERS.map(u=>{ const a=(p.resp||[]).includes(u.id); return (
                          <button key={u.id} onClick={()=>setPendientes(prev=>prev.map(x=>x.id===p.id?{...x,resp:a?x.resp.filter(r=>r!==u.id):[...(x.resp||[]),u.id]}:x))}
                            style={{display:"flex",alignItems:"center",gap:4,padding:mob?"7px 11px":"4px 9px",borderRadius:20,border:`2px solid ${a?u.color:"#e0e0e0"}`,background:a?u.color+"18":"white",color:a?u.color:"#888",fontSize:mob?12.5:11,fontWeight:600,cursor:"pointer",minHeight:mob?38:undefined}}>
                            <Avatar uid={u.id} size={mob?16:13}/>{u.name.split(" ")[0]}{a&&" ✓"}
                          </button>
                        );})}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                      <button onClick={()=>setEditId(null)} style={{background:"white",border:"1.5px solid #ccc",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Cancelar</button>
                      <button onClick={()=>saveEdit(p.id)} disabled={saving} style={{background:"#1a2f63",color:"white",border:"none",borderRadius:7,padding:"6px 16px",cursor:"pointer",fontSize:12,fontWeight:700,opacity:saving?.7:1}}>
                        {saving?"Guardando...":"Guardar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:mob?"10px 12px":"12px 16px"}}>
                    {/* Score badge */}
                    {!isInactivo && (
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flexShrink:0,minWidth:32}}>
                        <span style={{fontSize:8,color:"#e34948",fontWeight:700}}>U{p.urgencia||2}</span>
                        <span style={{fontSize:10,background:(p.urgencia||2)*(p.importancia||2)>=6?"#e34948":(p.urgencia||2)*(p.importancia||2)>=4?"#f0c020":"#1d6b53",color:"white",borderRadius:6,padding:"1px 5px",fontFamily:"monospace",fontWeight:800}}>{(p.urgencia||2)*(p.importancia||2)}</span>
                        <span style={{fontSize:8,color:"#1a2f63",fontWeight:700}}>I{p.importancia||2}</span>
                      </div>
                    )}
                    {statusBadge(p.status)}
                    <span style={{fontSize:mob?12.5:13,fontWeight:500,flex:1,lineHeight:1.4,
                      textDecoration:p.status==="no válido"?"line-through":"none",
                      color:p.status==="no válido"?"#aaa":"#272a33"}}>
                      {p.label}
                      {p.fecha && <span style={{fontSize:10,color:"#1a2f63",background:"#dfe7f7",borderRadius:10,padding:"1px 7px",marginLeft:6,fontWeight:600}}>
                        📅 {new Date(p.fecha+"T12:00:00").toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit"})}
                      </span>}
                    </span>
                    {(p.resp||[]).length>0 && <div style={{display:"flex",gap:2,flexShrink:0}}>{(p.resp||[]).map(uid=><Avatar key={uid} uid={uid} size={mob?20:18}/>)}</div>}
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <button onClick={()=>setEditId(p.id)} style={{background:"#f0f4ff",border:"1px solid #c0d0f0",color:"#3b4d8c",borderRadius:6,padding:mob?"6px 11px":"3px 9px",cursor:"pointer",fontSize:mob?12:11,fontWeight:600,minHeight:mob?34:undefined}}>Editar</button>
                      <button onClick={()=>deleteItem(p.id)} style={{background:"#fff0f0",border:"1px solid #f0c0c0",color:"#c0392b",borderRadius:6,padding:mob?"6px 10px":"3px 8px",cursor:"pointer",fontSize:mob?12:11,minHeight:mob?34:undefined}}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Formulario nuevo */}
          {showNew && (
            <div style={{padding:"14px 16px",background:"#f0f4ff",borderTop:"1px solid #c0d0f0",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontWeight:700,fontSize:13,color:"#1a2f63"}}>Nuevo pendiente</div>
              <input value={newItem.label} onChange={e=>setNewItem(p=>({...p,label:e.target.value}))}
                placeholder="Descripción del pendiente..." autoFocus
                style={{width:"100%",padding:mob?"10px 12px":"8px 11px",border:"1.5px solid #c0d0f0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/>
              <div>
                <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:4,fontWeight:700}}>Fecha límite (opcional)</div>
                <input type="date" value={newItem.fecha} onChange={e=>setNewItem(p=>({...p,fecha:e.target.value}))}
                  style={{padding:"7px 10px",border:"1.5px solid #c0d0f0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/>
              </div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Urgencia</div>
                  <div style={{display:"flex",gap:6}}>{[1,2,3].map(v=><ScoreBtn key={v} val={v} current={newItem.urgencia} color="#e34948" onClick={()=>setNewItem(p=>({...p,urgencia:v}))}/>)}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Importancia</div>
                  <div style={{display:"flex",gap:6}}>{[1,2,3].map(v=><ScoreBtn key={v} val={v} current={newItem.importancia} color="#1a2f63" onClick={()=>setNewItem(p=>({...p,importancia:v}))}/>)}</div>
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Estado</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {STATUS_OPTIONS.map(s=>{ const c=STATUS_CONFIG[s]; return (
                    <button key={s} onClick={()=>setNewItem(p=>({...p,status:s}))}
                      style={{padding:mob?"6px 11px":"3px 10px",borderRadius:20,border:`2px solid ${newItem.status===s?c.color:"#e0e0e0"}`,background:newItem.status===s?c.bg:"white",color:newItem.status===s?c.color:"#888",fontSize:mob?12:11,fontWeight:700,cursor:"pointer",minHeight:mob?34:undefined}}>
                      {s}
                    </button>
                  );})}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6,fontWeight:700}}>Responsables</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {USERS.map(u=>{ const a=newItem.resp.includes(u.id); return (
                    <button key={u.id} onClick={()=>setNewItem(p=>({...p,resp:a?p.resp.filter(r=>r!==u.id):[...p.resp,u.id]}))}
                      style={{display:"flex",alignItems:"center",gap:4,padding:mob?"7px 11px":"4px 9px",borderRadius:20,border:`2px solid ${a?u.color:"#e0e0e0"}`,background:a?u.color+"18":"white",color:a?u.color:"#888",fontSize:mob?12.5:11,fontWeight:600,cursor:"pointer",minHeight:mob?38:undefined}}>
                      <Avatar uid={u.id} size={mob?16:13}/>{u.name.split(" ")[0]}{a&&" ✓"}
                    </button>
                  );})}
                </div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>{setShowNew(false);setNewItem({label:"",status:"por iniciar",resp:[],fecha:"",urgencia:2,importancia:2});}}
                  style={{background:"white",border:"1.5px solid #ccc",borderRadius:7,padding:"6px 14px",cursor:"pointer",fontSize:12}}>Cancelar</button>
                <button onClick={addNew} disabled={saving||!newItem.label.trim()}
                  style={{background:newItem.label.trim()?"#1a2f63":"#aaa",color:"white",border:"none",borderRadius:7,padding:"6px 16px",cursor:newItem.label.trim()?"pointer":"default",fontSize:12,fontWeight:700}}>
                  {saving?"Guardando...":"Agregar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// DATOS CIERRE DE MES
// ─────────────────────────────────────────────
const ACTIVIDADES_CIERRE = [
  {id:"c1",  fase:"descarga", bold:true,  titulo:"Carga de actividad y prestaciones de Pabellón en sistema al día", responsable:"Katherine Figueroa",       area:"Pabellón"},
  {id:"c2",  fase:"descarga", bold:true,  titulo:"Provisión de pacientes acostados",                                  responsable:"Cecilia I. / Eduardo M.",   area:"Hospitalización"},
  {id:"c3",  fase:"descarga", bold:false, titulo:"Envío Ajustes MEMO y cálculo distribución",                         responsable:"Daniela Araya",             area:"Contabilidad"},
  {id:"c4",  fase:"descarga", bold:false, titulo:"Envío de consumo de servicios, ajustes de stocks, Farmacia VP y Eco",responsable:"Eduardo Morales",          area:"CdG"},
  {id:"c5",  fase:"descarga", bold:false, titulo:"Envío de Liquidación de Centro Médico, Dental, Urgencias, Fertilidad, Poli.", responsable:"Macarena F. / Daniela M.", area:"Administración"},
  {id:"c6",  fase:"descarga", bold:false, titulo:"Envío provisión costos con áreas MK, TI, Mantenciones para validación de cierre", responsable:"Joaquín P. / Daniela R.", area:"CdG"},
  {id:"c7",  fase:"descarga", bold:true,  titulo:"Bases preliminar de Prestaciones, MEI y HM a fichas",              responsable:"Eduardo Morales",            area:"CdG"},
  {id:"c8",  fase:"descarga", bold:true,  titulo:"Ingreso de HM x UEN",                                              responsable:"Isidora Sepúlveda",          area:"CdG"},
  {id:"c9",  fase:"descarga", bold:false, titulo:"Cálculo y contabilización de GRD/GES/NoGes",                       responsable:"Isidora Sepúlveda",          area:"CdG"},
  {id:"c10", fase:"descarga", bold:false, titulo:"Envío Informe Resumen CxC al cierre de Mes",                       responsable:"Francisca Montecinos",       area:"Cobranza"},
  {id:"c11", fase:"descarga", bold:false, titulo:"Envío de estimación Turnos Méd. y distribución sueldos y gratif.", responsable:"Paula Coronado",             area:"RRHH"},
  {id:"c12", fase:"descarga", bold:false, titulo:"Provisión Vacaciones y Finiquitos",                                 responsable:"Paula Coronado",             area:"RRHH"},
  {id:"c13", fase:"carga",    bold:true,  titulo:"Entrega de Base Ingresos y Reval x Fichas y MEI del mes, y Comp Cont.", responsable:"Eduardo Morales",       area:"CdG",            turno:"AM"},
  {id:"c14", fase:"carga",    bold:true,  titulo:"Centralización de remuneraciones",                                  responsable:"Paula Coronado",             area:"RRHH",           turno:"AM"},
  {id:"c15", fase:"carga",    bold:true,  titulo:"Provisión proyección prestaciones y HM",                            responsable:"Bastián Retamal",            area:"CdG",            turno:"AM"},
  {id:"c16", fase:"carga",    bold:false, titulo:"Cálculo final deterioro CxC",                                       responsable:"Isidora Sepúlveda",          area:"CdG"},
  {id:"c17", fase:"carga",    bold:false, titulo:"Ingresos devengados y Contabilización Hemosan",                     responsable:"Eduardo M. / Paola V.",      area:"CdG"},
  {id:"c18", fase:"carga",    bold:true,  titulo:"Consumo pacientes y provisión consumos",                            responsable:"Eduardo M. / Bastián R.",    area:"CdG"},
  {id:"c19", fase:"carga",    bold:false, titulo:"Envío data indicadores RRHH",                                       responsable:"Paula Coronado",             area:"RRHH"},
  {id:"c20", fase:"carga",    bold:false, titulo:"Envío de costos Turnos Médicos INFOGEST",                           responsable:"Paula C. / Fabiola M.",      area:"RRHH"},
  {id:"c21", fase:"carga",    bold:false, titulo:"Cierre de Libros de compra y ventas, Determinación de IVA No Recuperable", responsable:"Contabilidad",       area:"Contabilidad"},
  {id:"c22", fase:"carga",    bold:false, titulo:"Cierre de Bancos de todas las Sociedades",                          responsable:"Rodrigo Recabal",            area:"Tesorería"},
  {id:"c23", fase:"carga",    bold:true,  titulo:"Entrega de Base Honorarios Médicos del mes en carpetas compartidas",responsable:"Margarita M. / Fabiola M.", area:"RRHH",           turno:"AM"},
  {id:"c24", fase:"carga",    bold:false, titulo:"Flujo de efectivo",                                                 responsable:"Rodrigo Recabal",            area:"Tesorería",      turno:"PM"},
  {id:"c25", fase:"eerr",     bold:false, titulo:"Cierre de Impuestos a la renta",                                    responsable:"Vania Larraín",              area:"Contabilidad",   turno:"AM"},
  {id:"c26", fase:"eerr",     bold:false, titulo:"Cierre de VP",                                                      responsable:"Paola Valdebenito",          area:"Contabilidad",   turno:"AM"},
  {id:"c27", fase:"eerr",     bold:true,  titulo:"Reunión Pre Cierre",                                                responsable:"RedSalud / Finanzas / Personas", area:"RedSalud",  turno:""},
];

const CIERRES = [
  {mes:"Julio 2026",num:7,year:2026,corteInicio:"26/06/2026",corteFin:"28/07/2026",descarga:["Mié 29/07","Jue 30/07","Vie 31/07"],carga:["Lun 03/08","Mar 04/08","Mié 05/08","Jue 06/08"],pasado:false,actual:true,nota:"Fecha de corte especial: incluye desde 26/06 por ajuste del cierre anterior."},
  {mes:"Agosto 2026",num:8,year:2026,corteInicio:"29/07/2026",corteFin:"27/08/2026",descarga:["Jue 27/08","Vie 28/08","Lun 31/08"],carga:["Mar 01/09","Mié 02/09","Jue 03/09","Vie 04/09"],pasado:false,actual:false},
  {mes:"Septiembre 2026",num:9,year:2026,corteInicio:"28/08/2026",corteFin:"28/09/2026",descarga:["Lun 28/09","Mar 29/09","Mié 30/09"],carga:["Jue 01/10","Vie 02/10","Lun 05/10","Mar 06/10"],pasado:false,actual:false},
  {mes:"Octubre 2026",num:10,year:2026,corteInicio:"29/09/2026",corteFin:"27/10/2026",descarga:["Mié 28/10","Jue 29/10","Vie 30/10"],carga:["Lun 02/11","Mar 03/11","Mié 04/11","Jue 05/11"],pasado:false,actual:false,nota:"31/10 es feriado (Día de las Iglesias Evangélicas), se excluye del cierre."},
  {mes:"Noviembre 2026",num:11,year:2026,corteInicio:"28/10/2026",corteFin:"25/11/2026",descarga:["Jue 26/11","Vie 27/11","Lun 30/11"],carga:["Mar 01/12","Mié 02/12","Jue 03/12","Vie 04/12"],pasado:false,actual:false},
];

const CIERRES_PASADOS = [
  {mes:"Enero 2026",num:1,year:2026,corteInicio:"29/12/2025",corteFin:"27/01/2026",descarga:["Mié 28/01","Jue 29/01","Vie 30/01"],carga:["Lun 02/02","Mar 03/02","Mié 04/02","Jue 05/02"],pasado:true},
  {mes:"Febrero 2026",num:2,year:2026,corteInicio:"28/01/2026",corteFin:"24/02/2026",descarga:["Mié 25/02","Jue 26/02","Vie 27/02"],carga:["Lun 02/03","Mar 03/03","Mié 04/03","Jue 05/03"],pasado:true},
  {mes:"Marzo 2026",num:3,year:2026,corteInicio:"25/02/2026",corteFin:"26/03/2026",descarga:["Vie 27/03","Lun 30/03","Mar 31/03"],carga:["Mié 01/04","Jue 02/04","Lun 06/04","Mar 07/04"],pasado:true,nota:"3 y 4 de abril son Semana Santa (feriados), primer hábil es mié 01/04."},
  {mes:"Abril 2026",num:4,year:2026,corteInicio:"27/03/2026",corteFin:"27/04/2026",descarga:["Mar 28/04","Mié 29/04","Jue 30/04"],carga:["Lun 04/05","Mar 05/05","Mié 06/05","Jue 07/05"],pasado:true,nota:"1 de mayo es feriado, primer hábil del mes es lun 04/05."},
  {mes:"Mayo 2026",num:5,year:2026,corteInicio:"28/04/2026",corteFin:"26/05/2026",descarga:["Mié 27/05","Jue 28/05","Vie 29/05"],carga:["Lun 01/06","Mar 02/06","Mié 03/06","Jue 04/06"],pasado:true},
  {mes:"Junio 2026",num:6,year:2026,corteInicio:"27/05/2026",corteFin:"24/06/2026",descarga:["Jue 25/06","Vie 26/06","Mar 30/06"],carga:["Mié 01/07","Jue 02/07","Vie 03/07","Lun 06/07"],pasado:true,nota:"29/06 es feriado (San Pedro y San Pablo). 3° hábil salta al mar 30/06."},
];

function TarjetasPage({currentUser}) {
  const mob = useIsMobile();
  const [tarjetas, setTarjetas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [formTarget, setFormTarget] = useState(null);
  const [formTipo, setFormTipo]   = useState("amarilla");
  const [formMotivo, setFormMotivo] = useState("");
  const [saving, setSaving]       = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [tab, setTab]             = useState("semana"); // semana | ranking | historial

  const NOW   = new Date();
  const today = NOW.toISOString().split('T')[0];
  const currentWeek = getISOWeek(NOW);

  useEffect(()=>{
    db.getTarjetas().then(t=>{ setTarjetas(t); setLoading(false); }).catch(()=>setLoading(false));
  },[]);

  // ── Lógica de tarjetas ──
  // Calcular tarjetas efectivas por usuario por semana
  // 2 amarillas mismo día = roja; 3 tarjetas misma semana = roja
  function getResumenSemana(uid, semana) {
    const ts = tarjetas.filter(t=>t.target_uid===uid && t.semana===semana);
    const amarillas = ts.filter(t=>t.tipo==="amarilla");
    const rojas     = ts.filter(t=>t.tipo==="roja");

    // Verificar 2 amarillas mismo día → roja
    const porDia = {};
    amarillas.forEach(t=>{ porDia[t.fecha]=(porDia[t.fecha]||0)+1; });
    const rojaPorDia = Object.values(porDia).some(n=>n>=2);

    // Total tarjetas semana (amarillas + rojas directas)
    const totalSemana = ts.length;
    const tieneRoja = rojas.length>0 || rojaPorDia || totalSemana>=3;

    return { amarillas:amarillas.length, rojas:rojas.length, tieneRoja, rojaPorDia, total:totalSemana, tarjetas:ts };
  }

  function getAcumulado(uid) {
    const ts = tarjetas.filter(t=>t.target_uid===uid);
    const amarillas = ts.filter(t=>t.tipo==="amarilla").length;
    const rojas = ts.filter(t=>t.tipo==="roja").length;
    // Contar rojas efectivas por semana
    const semanas = [...new Set(ts.map(t=>t.semana))];
    let rojasEfectivas = rojas;
    semanas.forEach(sem=>{
      const r = getResumenSemana(uid, sem);
      if(r.tieneRoja && r.rojas===0) rojasEfectivas++;
    });
    return { amarillas, rojas, rojasEfectivas, total: ts.length };
  }

  async function asignarTarjeta() {
    if(!formTarget||!formMotivo.trim()) return;
    setSaving(true);
    const t = {
      id: `t_${Date.now()}`,
      target_uid: formTarget,
      assigned_by: currentUser.id,
      tipo: formTipo,
      motivo: formMotivo.trim(),
      fecha: today,
      semana: currentWeek,
    };
    try {
      await db.addTarjeta(t);
      setTarjetas(prev=>[t,...prev]);
      setShowForm(false); setFormTarget(null); setFormTipo("amarilla"); setFormMotivo("");
    } catch(e){ console.error(e); }
    setSaving(false);
  }

  async function eliminar(id) {
    try { await db.deleteTarjeta(id); setTarjetas(prev=>prev.filter(t=>t.id!==id)); }
    catch(e){ console.error(e); }
    setConfirmDel(null);
  }

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#aaa"}}>Cargando tarjetas...</div>;

  const semanaActual = tarjetas.filter(t=>t.semana===currentWeek);

  // Ranking acumulado
  const ranking = USERS.map(u=>({ u, ...getAcumulado(u.id) }))
    .sort((a,b)=>b.rojasEfectivas-a.rojasEfectivas||b.amarillas-a.amarillas);

  return (
    <div style={{padding:mob?"10px 10px 80px":"20px 28px 60px",maxWidth:900,margin:"0 auto"}}>

      {/* Header */}
      <div style={{marginBottom:16}}>
        <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:4}}>Control de Gestión · Juego del equipo</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63"}}>
            🟨 Tarjetas <span style={{color:"#8a2438"}}>del equipo</span>
          </div>
          <button onClick={()=>setShowForm(true)}
            style={{background:"#f0c020",border:"none",borderRadius:10,padding:"9px 18px",
              cursor:"pointer",fontSize:13,fontWeight:800,color:"#333",
              display:"flex",alignItems:"center",gap:7,boxShadow:"0 2px 8px rgba(240,192,32,.4)"}}>
            🟨 Asignar tarjeta
          </button>
        </div>
        <div style={{fontSize:12,color:"#888",marginTop:4}}>
          2 amarillas mismo día = 🟥 roja · 3 tarjetas en la semana = 🟥 roja · Penitencia: desayuno el viernes
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,marginBottom:16,background:"#f0ede8",borderRadius:10,padding:3}}>
        {[{id:"semana",label:"Esta semana"},{id:"ranking",label:"🏆 Ranking"},{id:"historial",label:"📋 Historial"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",
              background:tab===t.id?"white":"transparent",
              color:tab===t.id?"#1a2f63":"#888",
              fontWeight:700,fontSize:mob?11.5:13,cursor:"pointer",
              boxShadow:tab===t.id?"0 1px 4px rgba(0,0,0,.1)":"none",
              transition:"all .15s"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: SEMANA ACTUAL ── */}
      {tab==="semana" && (
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#1a2f63",marginBottom:12}}>
            {getSemanaLabel(currentWeek)} · {semanaActual.length} tarjeta{semanaActual.length!==1?"s":""}
          </div>

          <div style={{display:"grid",gridTemplateColumns:mob?"1fr 1fr":"repeat(3,1fr)",gap:10,marginBottom:20}}>
            {USERS.map(u=>{
              const res = getResumenSemana(u.id, currentWeek);
              const viernes = getViernes(currentWeek);
              return (
                <div key={u.id} style={{
                  background:"white",borderRadius:12,border:`2px solid ${res.tieneRoja?"#e34948":res.amarillas>0?"#f0c020":"#e8e5e0"}`,
                  padding:"14px 14px",position:"relative",
                  boxShadow:res.tieneRoja?"0 0 0 3px #e3494830":res.amarillas>0?"0 0 0 3px #f0c02030":"none"
                }}>
                  {/* Badge roja */}
                  {res.tieneRoja && (
                    <div style={{position:"absolute",top:-10,right:10,background:"#e34948",color:"white",
                      borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800,
                      boxShadow:"0 2px 8px rgba(227,73,72,.4)"}}>
                      🟥 ROJA
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <Avatar uid={u.id} size={32}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:mob?12:13,color:"#1a2f63"}}>{u.name.split(" ")[0]}</div>
                      <div style={{fontSize:10,color:"#aaa"}}>{u.name.split(" ").slice(1).join(" ")}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:res.tieneRoja?8:0}}>
                    <div style={{flex:1,background:"#fffbe6",borderRadius:8,padding:"6px",textAlign:"center"}}>
                      <div style={{fontSize:22,lineHeight:1}}>🟨</div>
                      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:18,color:"#b8860b"}}>{res.amarillas}</div>
                      <div style={{fontSize:9.5,color:"#aaa",marginTop:1}}>amarillas</div>
                    </div>
                    <div style={{flex:1,background:"#fff0f0",borderRadius:8,padding:"6px",textAlign:"center"}}>
                      <div style={{fontSize:22,lineHeight:1}}>🟥</div>
                      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:18,color:"#e34948"}}>{res.rojas}</div>
                      <div style={{fontSize:9.5,color:"#aaa",marginTop:1}}>rojas</div>
                    </div>
                  </div>
                  {res.tieneRoja && (
                    <div style={{background:"#fff3f3",border:"1px solid #f0c0c0",borderRadius:8,padding:"7px 10px",fontSize:11,color:"#e34948",fontWeight:600,textAlign:"center"}}>
                      🥐 Desayuno el viernes {viernes}
                    </div>
                  )}
                  {res.tarjetas.length>0 && (
                    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
                      {res.tarjetas.slice(0,3).map(t=>(
                        <div key={t.id} style={{fontSize:10.5,color:"#666",background:"#fafaf8",borderRadius:6,padding:"4px 8px",display:"flex",alignItems:"center",gap:4}}>
                          <span>{t.tipo==="amarilla"?"🟨":"🟥"}</span>
                          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.motivo}</span>
                        </div>
                      ))}
                      {res.tarjetas.length>3 && <div style={{fontSize:10,color:"#aaa",textAlign:"center"}}>+{res.tarjetas.length-3} más</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB: RANKING ── */}
      {tab==="ranking" && (
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#1a2f63",marginBottom:14}}>🏆 Ranking acumulado del período</div>
          <div style={{background:"white",borderRadius:12,border:"1px solid #e8e5e0",overflow:"hidden"}}>
            {/* Header */}
            <div style={{display:"grid",gridTemplateColumns:"40px 1fr 80px 80px 100px",background:"#1a2f63",color:"white",padding:"10px 16px",fontSize:11,fontWeight:700,gap:8}}>
              <div style={{textAlign:"center"}}>#</div>
              <div>JUGADOR</div>
              <div style={{textAlign:"center"}}>🟨</div>
              <div style={{textAlign:"center"}}>🟥</div>
              <div style={{textAlign:"center"}}>🥐 DESAYUNOS</div>
            </div>
            {ranking.map((r,i)=>{
              const medals = ["🥇","🥈","🥉"];
              const bgRank = i===0?"#fffbe6":i===1?"#f8f8f8":i===2?"#fff8f0":"white";
              return (
                <div key={r.u.id} style={{display:"grid",gridTemplateColumns:"40px 1fr 80px 80px 100px",
                  padding:"12px 16px",gap:8,alignItems:"center",
                  borderBottom:"1px solid #f0ede8",background:bgRank}}>
                  <div style={{textAlign:"center",fontSize:i<3?20:14,fontWeight:700,color:"#aaa"}}>
                    {i<3?medals[i]:i+1}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Avatar uid={r.u.id} size={28}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:"#1a2f63"}}>{r.u.name.split(" ")[0]}</div>
                      <div style={{fontSize:10,color:"#aaa"}}>{r.u.name.split(" ").slice(1).join(" ")}</div>
                    </div>
                  </div>
                  <div style={{textAlign:"center",fontFamily:"monospace",fontWeight:800,fontSize:18,color:r.amarillas>0?"#b8860b":"#ccc"}}>{r.amarillas}</div>
                  <div style={{textAlign:"center",fontFamily:"monospace",fontWeight:800,fontSize:18,color:r.rojasEfectivas>0?"#e34948":"#ccc"}}>{r.rojasEfectivas}</div>
                  <div style={{textAlign:"center",fontFamily:"monospace",fontWeight:800,fontSize:16,color:r.rojasEfectivas>0?"#b9711b":"#ccc"}}>
                    {r.rojasEfectivas>0?`${r.rojasEfectivas} 🥐`:"—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,fontSize:11,color:"#aaa",textAlign:"center"}}>
            Ranking basado en rojas efectivas (incluye 2 amarillas/día y 3 tarjetas/semana)
          </div>
        </div>
      )}

      {/* ── TAB: HISTORIAL ── */}
      {tab==="historial" && (
        <div>
          <div style={{fontWeight:700,fontSize:13,color:"#1a2f63",marginBottom:12}}>
            Historial completo · {tarjetas.length} tarjeta{tarjetas.length!==1?"s":""}
          </div>
          {tarjetas.length===0 && (
            <div style={{padding:"40px",textAlign:"center",color:"#aaa",fontSize:14}}>
              <div style={{fontSize:40,marginBottom:10}}>🏆</div>
              Sin tarjetas aún — el equipo se está portando bien
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {tarjetas.map(t=>{
              const target   = getUserById(t.target_uid);
              const assigner = getUserById(t.assigned_by);
              const isRoja   = t.tipo==="roja";
              const canDel   = currentUser.role==="admin" || currentUser.id===t.assigned_by;
              return (
                <div key={t.id} style={{
                  background:"white",borderRadius:10,
                  border:`1.5px solid ${isRoja?"#e3494840":"#f0c02040"}`,
                  borderLeft:`5px solid ${isRoja?"#e34948":"#f0c020"}`,
                  padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"
                }}>
                  <div style={{fontSize:28,flexShrink:0,marginTop:2}}>{isRoja?"🟥":"🟨"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                      <Avatar uid={t.target_uid} size={20}/>
                      <span style={{fontWeight:800,fontSize:13,color:target?.color}}>{target?.name}</span>
                      <span style={{fontSize:11,color:"#aaa"}}>·</span>
                      <span style={{fontFamily:"monospace",fontSize:10.5,color:"#888"}}>{t.fecha}</span>
                      <span style={{fontSize:10,background:isRoja?"#fff0f0":"#fffbe6",
                        color:isRoja?"#e34948":"#b8860b",borderRadius:10,padding:"1px 7px",fontWeight:700,border:`1px solid ${isRoja?"#f0c0c0":"#f0d060"}`}}>
                        {isRoja?"🟥 Roja":"🟨 Amarilla"}
                      </span>
                    </div>
                    <div style={{fontSize:13,color:"#333",fontStyle:"italic",marginBottom:6,lineHeight:1.4}}>
                      "{t.motivo}"
                    </div>
                    <div style={{fontSize:10.5,color:"#aaa",display:"flex",alignItems:"center",gap:4}}>
                      <span>Asignada por</span>
                      <Avatar uid={t.assigned_by} size={13}/>
                      <span style={{fontWeight:600,color:assigner?.color}}>{assigner?.name.split(" ")[0]}</span>
                      <span>· {getSemanaLabel(t.semana)}</span>
                    </div>
                  </div>
                  {canDel && (
                    confirmDel===t.id ? (
                      <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                        <button onClick={()=>eliminar(t.id)} style={{background:"#e34948",color:"white",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Sí</button>
                        <button onClick={()=>setConfirmDel(null)} style={{background:"#eee",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>No</button>
                      </div>
                    ) : (
                      <button onClick={()=>setConfirmDel(t.id)} style={{background:"none",border:"1px solid #e0ddd8",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,color:"#ccc",flexShrink:0}}>✕</button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL ASIGNAR TARJETA ── */}
      {showForm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,
          display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:20}}
          onClick={()=>setShowForm(false)}>
          <div style={{background:"white",borderRadius:mob?"16px 16px 0 0":"14px",
            width:"100%",maxWidth:480,padding:"20px",boxShadow:"0 8px 40px rgba(0,0,0,.25)"}}
            onClick={e=>e.stopPropagation()}>

            {mob && <div style={{width:44,height:5,background:"#ddd",borderRadius:3,margin:"-10px auto 14px"}}/>}

            <div style={{fontWeight:800,fontSize:18,color:"#1a2f63",marginBottom:4}}>Asignar tarjeta</div>
            <div style={{fontSize:12,color:"#888",marginBottom:18}}>Registra la conducta o comentario para el historial</div>

            {/* Tipo */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:8}}>Tipo de tarjeta</div>
              <div style={{display:"flex",gap:10}}>
                {[{id:"amarilla",icon:"🟨",label:"Amarilla",bg:"#fffbe6",border:"#f0c020",color:"#b8860b"},
                  {id:"roja",icon:"🟥",label:"Roja directa",bg:"#fff0f0",border:"#e34948",color:"#e34948"}].map(tp=>(
                  <button key={tp.id} onClick={()=>setFormTipo(tp.id)}
                    style={{flex:1,padding:"12px 8px",borderRadius:10,
                      border:`2.5px solid ${formTipo===tp.id?tp.border:"#e0ddd8"}`,
                      background:formTipo===tp.id?tp.bg:"white",cursor:"pointer",
                      textAlign:"center",transition:"all .15s"}}>
                    <div style={{fontSize:28}}>{tp.icon}</div>
                    <div style={{fontWeight:700,fontSize:13,color:formTipo===tp.id?tp.color:"#888",marginTop:4}}>{tp.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Jugador */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:8}}>¿Quién se la lleva?</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {USERS.filter(u=>u.id!==currentUser.id).map(u=>(
                  <button key={u.id} onClick={()=>setFormTarget(u.id)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:20,
                      border:`2px solid ${formTarget===u.id?u.color:"#e0ddd8"}`,
                      background:formTarget===u.id?u.color+"18":"white",
                      cursor:"pointer",fontSize:12.5,fontWeight:600,
                      color:formTarget===u.id?u.color:"#555"}}>
                    <Avatar uid={u.id} size={18}/>{u.name.split(" ")[0]}
                    {formTarget===u.id&&" ✓"}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivo */}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>¿Qué hizo o dijo? (para el registro)</div>
              <textarea value={formMotivo} onChange={e=>setFormMotivo(e.target.value)}
                placeholder='Ej: "Llegó 15 minutos tarde a la reunión de cierre sin avisar"'
                rows={3} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #e0ddd8",
                  borderRadius:8,fontSize:14,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5}}/>
            </div>

            {/* Botones */}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setShowForm(false);setFormTarget(null);setFormMotivo("");setFormTipo("amarilla");}}
                style={{flex:1,background:"#f5f3ee",border:"none",borderRadius:9,padding:"11px",cursor:"pointer",fontSize:13,fontWeight:600,color:"#666"}}>
                Cancelar
              </button>
              <button onClick={asignarTarjeta}
                disabled={!formTarget||!formMotivo.trim()||saving}
                style={{flex:2,background:!formTarget||!formMotivo.trim()?"#ccc":formTipo==="roja"?"#e34948":"#f0c020",
                  border:"none",borderRadius:9,padding:"11px",cursor:!formTarget||!formMotivo.trim()?"not-allowed":"pointer",
                  fontSize:14,fontWeight:800,color:formTipo==="roja"?"white":"#333",transition:"all .15s"}}>
                {saving?"Guardando...":formTipo==="amarilla"?"🟨 Asignar amarilla":"🟥 Asignar roja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE 6 — ICEO + PM
// ─────────────────────────────────────────────
function IceoPage() {
  const mob = useIsMobile();
  const C = {leo:"#1a2f63",bas:"#a3265c",iso:"#5b3f8c",dan:"#b9711b",joa:"#0e6e74"};
  return (
    <div style={{padding: mob?"12px 12px 70px":"24px 32px 60px", maxWidth:1400, margin:"0 auto"}}>
      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:5}}>Comité Gerencial · Contexto de la Reunión de los Martes</div>
      <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63",marginBottom:14}}>Estructura ICEO <span style={{color:"#8a2438"}}>— Comité Mensual</span></div>

      {/* Bloque permanente */}
      <div style={{background:"#1a2f63",color:"white",borderRadius:10,padding: mob?"12px 14px":"14px 20px",display:"flex",flexWrap:"wrap",alignItems:"center",gap:mob?10:20,marginBottom:16}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"white",color:"#1a2f63",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,flexShrink:0}}>1</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:mob?14:15}}>Revisión ICEO</div>
          <div style={{fontSize:mob?10.5:11.5,color:"#cdd8f5",marginTop:2}}>Bloque permanente · todas las reuniones · actividad y $</div>
        </div>
        <div style={{fontSize:mob?10:11,color:"#cdd8f5",width:mob?"100%":undefined,paddingTop:mob?6:0,borderTop:mob?"1px solid rgba(255,255,255,.15)":undefined}}>
          Actividad clínica · Producción · Ingresos · Desviaciones y alertas
        </div>
        <div style={{fontWeight:800,fontSize:mob?12:13,whiteSpace:"nowrap",borderLeft:mob?undefined:"1px solid rgba(255,255,255,.2)",paddingLeft:mob?0:16}}>
          BLOQUE FIJO &nbsp;<span style={{fontSize:mob?18:22}}>15 min</span>
        </div>
      </div>

      {/* Profundización — cards on mobile, table on desktop */}
      <div style={{fontFamily:"monospace",fontWeight:700,fontSize:10.5,textTransform:"uppercase",letterSpacing:.08,color:"#1a2f63",marginBottom:4}}>Calendario de Profundización Gerencial</div>
      <div style={{fontSize:11.5,color:"#5b5f6b",marginBottom:12}}>Cada martes, una gerencia profundiza sus indicadores y planes de acción.</div>

      {mob ? (
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
          {[
            {sem:"1° Martes", gers:[{name:"Dirección Médica + Subdirección Médica",col:"#3b4d8c",items:["Indicadores clínicos"]},{name:"Gestión Operacional",col:C.iso,items:["Capacidad y eficiencia operativa","ISB · Proyección de actividad"]}], obj:"Desempeño clínico y operacional."},
            {sem:"2° Martes", gers:[{name:"Finanzas + Control de Gestión",col:C.leo,items:["Cierre Mes t-1","Proyección Mes T","Desviaciones"]}], obj:"Resultados financieros y desviaciones."},
            {sem:"3° Martes", gers:[{name:"Soporte Operacional",col:C.joa,items:["Abastecimiento, soporte crítico","CAPEX y Master Plan"]},{name:"Gestión de Personas",col:C.joa,items:["Dotación, ausentismo","Clima, productividad"]}], obj:"Continuidad operacional e inversiones."},
            {sem:"4° Martes", gers:[{name:"Comercial y Marketing",col:C.bas,items:["Convenios y aseguradoras","Licitaciones","Márgenes quirúrgicos","ROI campañas","Posicionamiento y captación"]}], obj:"Crecimiento sostenible a través de relaciones comerciales, márgenes y estrategia de marketing."},
          ].map((row,ri)=>(
            <div key={ri} style={{background:"white",borderRadius:9,border:"1px solid #dad6cc",overflow:"hidden"}}>
              <div style={{background:"#1a2f63",color:"white",padding:"8px 14px",fontWeight:800,fontSize:12}}>{row.sem}</div>
              <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
                {row.gers.map((g,gi)=>(
                  <div key={gi} style={{borderLeft:`3px solid ${g.col}`,paddingLeft:10}}>
                    <div style={{fontWeight:700,color:g.col,fontSize:12,marginBottom:4}}>{g.name}</div>
                    <ul style={{paddingLeft:12,margin:0,color:"#555",fontSize:11.5}}>
                      {g.items.map((it,ii)=><li key={ii}>{it}</li>)}
                    </ul>
                  </div>
                ))}
                <div style={{fontSize:11,color:"#888",fontStyle:"italic",paddingTop:6,borderTop:"1px dashed #eee"}}>🎯 {row.obj}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{overflowX:"auto",marginBottom:24}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
            <thead>
              <tr style={{background:"#f5f3ee"}}>
                {["SEMANA","GERENCIA LÍDER","¿QUÉ VEREMOS?","TIEMPO","OBJETIVO"].map(h=>(
                  <th key={h} style={{padding:"8px 12px",border:"1px solid #dad6cc",textAlign:"left",fontFamily:"monospace",fontSize:9.5,fontWeight:700,textTransform:"uppercase",letterSpacing:.07,color:"#5b5f6b"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {sem:"1° Martes",gers:[{name:"Dirección Médica + Subdirección Médica",col:"#3b4d8c"},{name:"Gestión Operacional",col:C.iso}],content:[["Indicadores clínicos"],["Capacidad y eficiencia operativa","ISB · Proyección de actividad"]],obj:"Analizar el desempeño clínico y operacional para mejorar la calidad y eficiencia."},
                {sem:"2° Martes",gers:[{name:"Finanzas + Control de Gestión",col:C.leo}],content:[["Cierre Mes t-1","Proyección Mes T","Desviaciones"]],obj:"Revisar resultados financieros para asegurar sostenibilidad."},
                {sem:"3° Martes",gers:[{name:"Soporte Operacional",col:C.joa},{name:"Gestión de Personas",col:C.joa}],content:[["Abastecimiento, soporte crítico","CAPEX y Master Plan"],["Dotación, ausentismo","Clima, productividad"]],obj:"Asegurar continuidad operacional y disponibilidad de recursos clave."},
                {sem:"4° Martes",gers:[{name:"Comercial y Marketing",col:C.bas}],content:[["Convenios y aseguradoras","Licitaciones","Márgenes quirúrgicos · Estado proyectos","ROI campañas · Posicionamiento y captación"]],obj:"Impulsar crecimiento sostenible a través de relaciones comerciales, licitaciones, optimización de márgenes y estrategia de marketing."},
              ].map((row,ri)=>row.gers.map((g,gi)=>(
                <tr key={`${ri}-${gi}`} style={{background:gi%2===0?"white":"#fafaf8"}}>
                  {gi===0&&<td rowSpan={row.gers.length} style={{padding:"10px 12px",border:"1px solid #dad6cc",background:"#1a2f63",color:"white",fontWeight:800,fontSize:12.5,textAlign:"center",verticalAlign:"middle",whiteSpace:"nowrap"}}>{row.sem}</td>}
                  <td style={{padding:"9px 12px",border:"1px solid #dad6cc"}}><div style={{fontWeight:700,color:g.col,fontSize:12,display:"flex",alignItems:"center",gap:5}}><span style={{width:7,height:7,borderRadius:"50%",background:g.col,display:"inline-block",flexShrink:0}}/>{g.name}</div></td>
                  <td style={{padding:"9px 12px",border:"1px solid #dad6cc"}}><ul style={{paddingLeft:14,margin:0,color:"#555",fontSize:11.5}}>{row.content[gi].map((c,ci)=><li key={ci}>{c}</li>)}</ul></td>
                  <td style={{padding:"9px 12px",border:"1px solid #dad6cc",whiteSpace:"nowrap"}}><span style={{background:"#e4f0ea",color:"#1d6b53",fontWeight:700,fontSize:11,padding:"3px 9px",borderRadius:5}}>45 min</span></td>
                  {gi===0&&<td rowSpan={row.gers.length} style={{padding:"9px 12px",border:"1px solid #dad6cc",fontSize:11.5,color:"#5b5f6b",fontStyle:"italic",lineHeight:1.45,verticalAlign:"top"}}>{row.obj}</td>}
                </tr>
              )))}
              <tr style={{background:"#f5f3ee"}}><td colSpan={5} style={{padding:"9px 14px",border:"1px solid #dad6cc",fontSize:11,color:"#5b5f6b",fontStyle:"italic"}}>Tiempos referenciales (45 min). El bloque <strong>Revisión ICEO es permanente</strong> (15 min).</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* PM */}
      <div style={{fontWeight:800,fontSize:mob?18:22,color:"#1a2f63",marginBottom:4}}>Performance <span style={{color:"#8a2438"}}>Management</span></div>
      <div style={{fontSize:11.5,color:"#5b5f6b",marginBottom:14}}>Indicadores clave, ritmo de gestión y reuniones temáticas.</div>
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:mob?10.5:11,minWidth:mob?700:undefined}}>
          <thead>
            <tr style={{background:"#f5f3ee"}}>
              {["DIMENSIÓN","SUB-ÁREA","DIARIO","SEMANAL","MENSUAL","TRIMESTRAL","ANUAL","RESPONSABLE"].map(h=>(
                <th key={h} style={{padding:"7px 10px",border:"1px solid #dad6cc",textAlign:"left",fontFamily:"monospace",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.06,color:"#5b5f6b",whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              {dim:"1 · FINANCIERA",dimBg:"#1a2f63",rows:[{sub:"Financiera",d:["Ingresos $","Actividad clínica"],s:["Ingresos semanal vs ppto","Actividad semanal vs ppto","Flujo de caja"],m:["Ingresos vs ppto","Resultado del mes","Cuentas por cobrar","Cuentas por pagar","Coverage · Prueba ácida"],t:["Resultado acumulado","ROIC / Rentabilidad","Proyección cierre año"],a:["Presupuesto anual","Forecast"],resp:"leo"}]},
              {dim:"2 · PACIENTE Y MERCADO",dimBg:"#1d6b53",rows:[
                {sub:"Comercial y Marketing",
                  d:["Presupuesto cantidad y concreción","TM de prestaciones","Leads por canal","Tráfico web / campañas"],
                  s:["Presupuestos semanales: cantidad y concreción","ROI campañas","Costo por leads","Tasa conversión"],
                  m:["Mix pacientes / aseguradoras","Convenios y contratos","Productos nuevos","Venta por aseguradora","Performance multicanal","Branding y reputación"],
                  t:["Pipeline comercial","Rentabilidad por segmento","Estrategia comercial","Plan de marketing anual"],
                  a:["Objetivos comerciales","Rentabilidad por segmento","Estrategia de marca"],
                  resp:"bas"},
                {sub:"Experiencia Pacientes",d:["NPS / Satisfacción","Tiempos de espera","Cantidad reclamos"],s:["NPS/88 consolidado","Reclamos y causa raíz","Recomendación global"],m:["Tendencia NPS","Planes de mejora"],t:["Objetivos experiencia","Benchmark"],a:["Objetivos experiencia","Benchmark"],resp:"bas"}
              ]},
              {dim:"3 · PROCESOS Y OPERACIÓN",dimBg:"#5b3f8c",rows:[
                {sub:"Operacional · Eficiencia",d:["Productividad pabellón (%)","Productividad consultas","Uso insumos críticos"],s:["Productividad clínica global","Costo por paciente","Índice de suspensiones"],m:["Eficiencia por unidad","Productividad por especialidad","Variación costos operativos"],t:["Eficiencia consolidada","Proyectos de eficiencia"],a:["Objetivos eficiencia","Plan de productividad"],resp:"iso"},
                {sub:"Calidad",d:["IAAS","Eventos adversos","Mortalidad ajustada"],s:["Indicadores calidad clínica","Cumplimiento acreditación","Eventos centinela"],m:["Indicadores calidad","Cumplimiento acreditación","Eventos centinela"],t:["Resultados acreditación","Plan de calidad","Gestión riesgos"],a:["Objetivos calidad","Plan estratégico"],resp:"iso"},
                {sub:"CAPEX / Inversión",d:["Ejecución vs ppto","Avance físico diario (%)"],s:["Presupuesto vs real (%)","Avance físico obras (%)","Desviaciones principales"],m:["Ejecución acumulada vs ppto","Ejecución de contratos","Proyección término obras"],t:["ROI / Valor esperado","Revisión caso de inversión"],a:["Plan maestro 3-5 años","Ejecución inversiones"],resp:"dan"}
              ]},
              {dim:"4 · PERSONAS",dimBg:"#b9711b",rows:[{sub:"Personas / Cultura",d:["Ausentismo del día (%)","Personal por turno","Incidentes laborales"],s:["Ausentismo semanal (%)","Horas extras","Rotación semanal"],m:["Ausentismo (%)","Rotación (%)","Clima laboral (índice)"],t:["Clima laboral","Planes de desarrollo","Capacitación"],a:["Objetivos personas","Plan cultura y desarrollo"],resp:"joa"},{sub:"Soporte Operacional",d:["Seguimiento de ahorros","Revisión diaria indicadores"],s:["Revisión de margen","Rotación de MEI","Consumo por servicio"],m:["Revisión de margen","Rotación de MEI","Consumo por servicio"],t:["Optimización de recursos","Plan de mejora continua"],a:["Objetivos soporte","Plan anual de eficiencia"],resp:"dan"}]},
            ].map((section,si)=>section.rows.map((row,ri)=>{
              const u=getUserById(row.resp);
              return (
                <tr key={`${si}-${ri}`} style={{background:ri%2===0?"white":"#fafaf8"}}>
                  {ri===0&&<td rowSpan={section.rows.length} style={{padding:"8px 10px",border:"1px solid #dad6cc",background:section.dimBg,color:"white",fontWeight:800,fontSize:9.5,writingMode:"vertical-rl",textOrientation:"mixed",textAlign:"center",letterSpacing:.05,verticalAlign:"middle"}}>{section.dim}</td>}
                  <td style={{padding:"7px 10px",border:"1px solid #dad6cc",fontWeight:700,color:"#1a2f63",fontSize:11,whiteSpace:"nowrap"}}>{row.sub}</td>
                  {[row.d,row.s,row.m,row.t,row.a].map((items,ci)=>(
                    <td key={ci} style={{padding:"7px 10px",border:"1px solid #dad6cc",verticalAlign:"top"}}>
                      <ul style={{paddingLeft:13,margin:0,color:"#555",lineHeight:1.5}}>{items.map((item,ii)=><li key={ii}>{item}</li>)}</ul>
                    </td>
                  ))}
                  <td style={{padding:"7px 10px",border:"1px solid #dad6cc",whiteSpace:"nowrap"}}>
                    <div style={{fontWeight:700,fontSize:11,color:u?.color}}>{u?.name}</div>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────
function TaskChip({task, hasComment, draggable, onDragStart, onDragEnd, onClick, onToggleStatus}) {
  const s = getTypeStyle(task.type);
  const isListo = task.status==="listo";
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{display:"flex",alignItems:"center",gap:3,background:isListo?"#e4f0ea":s.bg,color:isListo?"#1d6b53":s.fg,borderRadius:4,padding:"2.5px 5px",fontSize:9.5,fontWeight:600,lineHeight:1.3,userSelect:"none",border:`1px solid ${isListo?"#a0d0b0":s.fg==="white"?s.bg+"80":"rgba(0,0,0,.07)"}`,opacity:isListo?0.75:1,transition:"all .15s"}}
      onMouseEnter={e=>e.currentTarget.style.opacity=isListo?"0.6":".85"}
      onMouseLeave={e=>e.currentTarget.style.opacity=isListo?"0.75":"1"}>
      {/* Toggle status — solo para tareas no recurrentes */}
      {task.type !== "rutina" && (
        <button onClick={e=>{e.stopPropagation();onToggleStatus&&onToggleStatus(task.id);}}
          title={isListo?"Marcar como pendiente":"Marcar como listo"}
          style={{background:"none",border:"none",cursor:"pointer",padding:"0 2px 0 0",fontSize:10,lineHeight:1,color:"inherit",flexShrink:0}}>
          {isListo?"✅":"⬜"}
        </button>
      )}
      <span onClick={onClick} style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer",textDecoration:isListo?"line-through":undefined}}>{task.title}</span>
      {hasComment && <span style={{fontSize:8,opacity:.7}}>💬</span>}
      <span style={{display:"flex",flexShrink:0}}>
        {task.resp.slice(0,2).map(uid=><Avatar key={uid} uid={uid} size={11}/>)}
        {task.resp.length>2 && <span style={{fontSize:8,opacity:.7}}>+{task.resp.length-2}</span>}
      </span>
    </div>
  );
}

function TaskChipMobile({task, hasComment, onClick, onToggleStatus}) {
  const s = getTypeStyle(task.type);
  const isListo = task.status==="listo";
  return (
    <div
      style={{display:"flex",alignItems:"center",gap:8,background:isListo?"#e4f0ea":s.bg,color:isListo?"#1d6b53":s.fg,borderRadius:7,padding:"8px 10px",fontSize:12,fontWeight:600,lineHeight:1.35,userSelect:"none",border:`1px solid ${isListo?"#a0d0b0":s.fg==="white"?s.bg+"80":"rgba(0,0,0,.07)"}`,minHeight:38,opacity:isListo?.8:1}}>
      {task.type !== "rutina" && (
        <button onClick={e=>{e.stopPropagation();onToggleStatus&&onToggleStatus(task.id);}}
          style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:16,lineHeight:1,flexShrink:0}}>
          {isListo?"✅":"⬜"}
        </button>
      )}
      <span onClick={onClick} style={{flex:1,lineHeight:1.3,cursor:"pointer",textDecoration:isListo?"line-through":undefined}}>{task.title}</span>
      <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
        {hasComment && <span style={{fontSize:11}}>💬</span>}
        <span style={{display:"flex",gap:1}}>
          {task.resp.slice(0,3).map(uid=><Avatar key={uid} uid={uid} size={18}/>)}
          {task.resp.length>3 && <span style={{fontSize:10,opacity:.7}}>+{task.resp.length-3}</span>}
        </span>
        <span onClick={onClick} style={{fontSize:14,opacity:.4,cursor:"pointer"}}>›</span>
      </div>
    </div>
  );
}

function TaskModal({task, comments, currentUser, onClose, onSave, onDelete, onDuplicate, onAddComment, canEdit}) {
  const mob = useIsMobile();
  const [draft, setDraft]           = useState({...task});
  const [newComment, setNew]        = useState("");
  const [tab, setTab]               = useState("edit");
  const [confirmDel, setConfirmDel] = useState(false);
  const [showRecurr, setShowRecurr] = useState(false);
  const [recurrType, setRecurrType] = useState("semanal");
  const [recurrHasta, setRecurrHasta] = useState("2026-12-31");
  const [recurrPreview, setRecurrPreview] = useState([]);
  const [recurrDiaHabil, setRecurrDiaHabil] = useState(1);

  const MESES_SHORT = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const DIAS_SHORT  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  const FERIADOS_SET = new Set(["2026-07-16","2026-08-15","2026-09-18","2026-09-19","2026-10-12","2026-10-31","2026-11-01","2026-12-08","2026-12-25"]);
  function isHabilDate(d) { return d.getDay()!==0 && d.getDay()!==6 && !FERIADOS_SET.has(d.toISOString().split('T')[0]); }

  function getNthHabil(year, month, n) {
    const d = new Date(year, month-1, 1);
    let count = 0;
    while(d.getMonth()===month-1) {
      if(isHabilDate(d)) { count++; if(count===n) return new Date(d); }
      d.setDate(d.getDate()+1);
    }
    return null;
  }

  function calcRecurr(tipo, hasta, diaHabil) {
    const t = tipo || recurrType;
    const h = hasta || recurrHasta;
    const nth = diaHabil || recurrDiaHabil;
    const base = new Date(2026, draft.month-1, draft.day);
    const hastaDate = new Date(h);
    const fechas = [];
    if(t==="semanal") {
      const d = new Date(base); d.setDate(d.getDate()+7);
      while(d <= hastaDate) {
        if(isHabilDate(d)) fechas.push(new Date(d));
        d.setDate(d.getDate()+7);
      }
    } else {
      let m = draft.month+1, y = 2026;
      while(true) {
        if(m>12){m=1;y++;}
        const nd = getNthHabil(y, m, nth);
        if(!nd || nd > hastaDate) break;
        fechas.push(nd);
        m++;
      }
    }
    setRecurrPreview(fechas);
    return fechas;
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:20}} onClick={onClose}>
      <div
        style={{background:"white",borderRadius:mob?"16px 16px 0 0":"12px",width:"100%",maxWidth:mob?undefined:540,maxHeight:mob?"92vh":"88vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)"}}
        onClick={e=>e.stopPropagation()}>

        {/* Drag handle + botón cerrar en mobile */}
        {mob && (
          <div style={{display:"flex",alignItems:"center",padding:"10px 16px 6px",flexShrink:0}}>
            <div style={{flex:1}}/>
            <div style={{width:44,height:5,background:"#ddd",borderRadius:3,position:"absolute",left:"50%",transform:"translateX(-50%)",top:10}}/>
            <button onClick={onClose}
              style={{background:"#f0f0f0",border:"none",borderRadius:20,padding:"6px 18px",
                cursor:"pointer",fontSize:13,fontWeight:700,color:"#555",
                display:"flex",alignItems:"center",gap:5}}>
              ✕ Cerrar
            </button>
          </div>
        )}

        {/* Header */}
        <div style={{padding: mob?"12px 16px 10px":"14px 18px 10px",borderBottom:"1px solid #ebebeb",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9.5,fontFamily:"monospace",fontWeight:700,letterSpacing:.1,textTransform:"uppercase",color:"#999",marginBottom:3}}>Día {task.day} · {MONTHS.find(mx=>mx.num===task.month)?.label} 2026</div>
            <div style={{fontSize:mob?14:15,fontWeight:800,color:"#1a2f63",lineHeight:1.2}}>{draft.title}</div>
          </div>
          <button onClick={onClose} style={{background:"#f5f5f5",border:"none",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:16,color:"#666",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>×</button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid #ebebeb",padding:`0 ${mob?16:18}px`}}>
          {[["edit","✏️ Editar"],["comments","💬 Comentarios"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",borderBottom:`2.5px solid ${tab===t?"#1a2f63":"transparent"}`,padding: mob?"10px 14px":"8px 14px",cursor:"pointer",fontSize:mob?13:12,fontWeight:700,color:tab===t?"#1a2f63":"#aaa"}}>
              {l}{t==="comments"&&comments.length>0&&<span style={{background:"#8a2438",color:"white",borderRadius:10,padding:"1px 5px",fontSize:9.5,marginLeft:4}}>{comments.length}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding: mob?"14px 16px":"14px 18px",WebkitOverflowScrolling:"touch"}}>
          {tab==="edit" ? (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {draft.type !== "rutina" && (
                <Field label="Estado de la tarea">
                  <div style={{display:"flex",gap:8}}>
                    {["pendiente","listo"].map(s=>{
                      const active = (draft.status||"pendiente")===s;
                      const cfg = s==="listo"
                        ? {bg:"#e4f0ea",color:"#1d6b53",border:"#a0d0b0",icon:"✅"}
                        : {bg:"#f6e3e6",color:"#8a2438",border:"#d4a0a8",icon:"⏳"};
                      return (
                        <button key={s} onClick={()=>canEdit&&setDraft(d=>({...d,status:s}))}
                          style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                            padding:mob?"10px":"7px 12px",borderRadius:8,
                            border:`2px solid ${active?cfg.border:"#e0e0e0"}`,
                            background:active?cfg.bg:"white",color:active?cfg.color:"#aaa",
                            fontWeight:700,fontSize:mob?13:12,cursor:canEdit?"pointer":"default",
                            minHeight:mob?42:undefined}}>
                          {cfg.icon} {s.charAt(0).toUpperCase()+s.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}
              <Field label="Título">
                {canEdit ? <input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} style={{width:"100%",padding: mob?"10px 12px":"7px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/> : <div style={{fontSize:13,padding:"3px 0"}}>{draft.title}</div>}
              </Field>
              <Field label="Reagendar">
                {canEdit ? (
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:120}}>
                      <div style={{fontSize:10,color:"#aaa",marginBottom:4}}>Mes</div>
                      <select value={draft.month||7} onChange={e=>setDraft(d=>({...d,month:parseInt(e.target.value)}))}
                        style={{width:"100%",padding:mob?"10px 12px":"6px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?16:13,background:"white",cursor:"pointer"}}>
                        {MONTHS.map(m=><option key={m.num} value={m.num}>{m.label}</option>)}
                      </select>
                    </div>
                    <div style={{flex:1,minWidth:120}}>
                      <div style={{fontSize:10,color:"#aaa",marginBottom:4}}>Día hábil</div>
                      <select value={draft.day} onChange={e=>setDraft(d=>({...d,day:parseInt(e.target.value)}))}
                        style={{width:"100%",padding:mob?"10px 12px":"6px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?16:13,background:"white",cursor:"pointer"}}>
                        {getWorkDays(draft.month||7).map(d=><option key={d} value={d}>Día {d}</option>)}
                      </select>
                    </div>
                  </div>
                ) : <div style={{fontSize:13}}>Mes {draft.month} · Día {draft.day}</div>}
              </Field>
              <Field label="Tipo">
                {canEdit ? (
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {TASK_TYPES.map(t=>{ const a=draft.type===t.id; return <button key={t.id} onClick={()=>setDraft(d=>({...d,type:t.id}))} style={{padding: mob?"6px 11px":"3px 9px",borderRadius:20,border:`2px solid ${a?t.bg:"#e0e0e0"}`,background:a?t.bg:t.bg+"22",color:a?t.fg:"#555",fontSize:mob?12:11,fontWeight:700,cursor:"pointer",minHeight:mob?34:undefined}}>{t.label}</button>; })}
                  </div>
                ) : <div style={{fontSize:12,fontWeight:700,color:getTypeStyle(draft.type).fg,background:getTypeStyle(draft.type).bg,display:"inline-block",padding:"3px 10px",borderRadius:20}}>{getTypeStyle(draft.type).label}</div>}
              </Field>
              <Field label="Responsables">
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {USERS.map(u=>{ const a=draft.resp.includes(u.id); return (
                    <button key={u.id} onClick={()=>canEdit&&setDraft(d=>({...d,resp:a?d.resp.filter(r=>r!==u.id):[...d.resp,u.id]}))}
                      style={{display:"flex",alignItems:"center",gap:5,padding: mob?"7px 11px":"4px 9px",borderRadius:20,border:`2px solid ${a?u.color:"#e0e0e0"}`,background:a?u.color+"18":"white",cursor:canEdit?"pointer":"default",fontSize:mob?12.5:11,fontWeight:600,color:a?u.color:"#888",minHeight:mob?38:undefined}}>
                      <Avatar uid={u.id} size={mob?18:14}/>{u.name.split(" ")[0]}{a&&<span style={{fontSize:mob?13:11,color:u.color}}>✓</span>}
                    </button>
                  );})}
                </div>
              </Field>
              {/* ── Recurrencia ── */}
              {canEdit && (
                <div style={{background:showRecurr?"#f0f4ff":"#fafaf8",border:`1.5px solid ${showRecurr?"#c0d0f0":"#e8e5e0"}`,borderRadius:9,padding:"10px 13px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#1a2f63",display:"flex",alignItems:"center",gap:6}}>
                      🔁 Repetir esta tarea
                    </div>
                    <button onClick={()=>{ setShowRecurr(s=>!s); if(!showRecurr) calcRecurr(); }}
                      style={{background:showRecurr?"#1a2f63":"white",color:showRecurr?"white":"#1a2f63",
                        border:"1.5px solid #1a2f63",borderRadius:20,padding:"4px 12px",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      {showRecurr?"Cancelar":"Activar"}
                    </button>
                  </div>

                  {showRecurr && (
                    <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
                      {/* Tipo */}
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>Frecuencia</div>
                        <div style={{display:"flex",gap:8}}>
                          {[{id:"semanal",label:`📅 Semanal (cada ${DIAS_SHORT[new Date(2026,draft.month-1,draft.day).getDay()]})`},
                            {id:"mensual",label:`📆 Mensual (día hábil fijo)`}].map(f=>(
                            <button key={f.id} onClick={()=>{setRecurrType(f.id);calcRecurr(f.id,recurrHasta);}}
                              style={{flex:1,padding:"8px 6px",borderRadius:8,border:`2px solid ${recurrType===f.id?"#1a2f63":"#e0e0e0"}`,
                                background:recurrType===f.id?"#1a2f63":"white",color:recurrType===f.id?"white":"#666",
                                fontSize:mob?12:11,fontWeight:700,cursor:"pointer",textAlign:"center"}}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Selector de día hábil para mensual */}
                      {recurrType==="mensual" && (
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>¿Qué día hábil del mes?</div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {[1,2,3,4,5].map(n=>(
                              <button key={n} onClick={()=>{setRecurrDiaHabil(n);calcRecurr("mensual",recurrHasta,n);}}
                                style={{padding:"6px 12px",borderRadius:8,
                                  border:`2px solid ${recurrDiaHabil===n?"#1a2f63":"#e0e0e0"}`,
                                  background:recurrDiaHabil===n?"#1a2f63":"white",
                                  color:recurrDiaHabil===n?"white":"#666",
                                  fontSize:11,fontWeight:700,cursor:"pointer"}}>
                                {n}° hábil
                              </button>
                            ))}
                          </div>
                          <div style={{fontSize:10,color:"#aaa",marginTop:4}}>
                            Ej: "1° hábil" = primer lunes/martes/etc hábil de cada mes
                          </div>
                        </div>
                      )}

                      {/* Hasta */}
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:"#aaa",textTransform:"uppercase",letterSpacing:.07,marginBottom:6}}>Repetir hasta</div>
                        <input type="date" value={recurrHasta}
                          onChange={e=>{setRecurrHasta(e.target.value);calcRecurr(recurrType,e.target.value,recurrDiaHabil);}}
                          min="2026-07-01" max="2026-12-31"
                          style={{padding:"7px 10px",border:"1.5px solid #c0d0f0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/>
                      </div>

                      {/* Preview */}
                      {recurrPreview.length>0 && (
                        <div style={{background:"white",borderRadius:7,border:"1px solid #e0ddd8",padding:"8px 10px"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#1a2f63",marginBottom:6}}>
                            Se crearán {recurrPreview.length} copias:
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:4,maxHeight:80,overflowY:"auto"}}>
                            {recurrPreview.map((d,i)=>(
                              <span key={i} style={{fontSize:10,background:"#dfe7f7",color:"#1a2f63",borderRadius:10,padding:"2px 7px",fontFamily:"monospace",fontWeight:600}}>
                                {DIAS_SHORT[d.getDay()]} {d.getDate()} {MESES_SHORT[d.getMonth()+1]}
                              </span>
                            ))}
                          </div>
                          {recurrPreview.length>20 && <div style={{fontSize:10,color:"#aaa",marginTop:4}}>+{recurrPreview.length-20} más</div>}
                        </div>
                      )}
                      {recurrPreview.length===0 && <div style={{fontSize:11,color:"#e34948"}}>No hay días hábiles en ese rango.</div>}
                    </div>
                  )}
                </div>
              )}

              <Field label="Notas">
                {canEdit ? <textarea value={draft.notes||""} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} rows={3} placeholder="Contexto, links, instrucciones..." style={{width:"100%",padding: mob?"10px 12px":"7px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?15:12.5,fontFamily:"inherit",resize:"vertical",outline:"none"}}/> : <div style={{fontSize:12.5,color:"#555",lineHeight:1.5}}>{draft.notes||<span style={{color:"#bbb"}}>Sin notas</span>}</div>}
              </Field>
            </div>
          ) : (
            <div>
              {comments.length===0 && <div style={{color:"#bbb",fontSize:13,textAlign:"center",padding:"16px 0"}}>Sin comentarios aún.</div>}
              <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
                {comments.map((c,i)=>{ const u=getUserById(c.uid); return (
                  <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    <Avatar uid={c.uid} size={28}/>
                    <div style={{flex:1,background:"#f7f6f2",borderRadius:8,padding:"7px 11px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontWeight:700,fontSize:12,color:u?.color}}>{u?.name}</span>
                        <span style={{fontSize:10,color:"#bbb"}}>{new Date(c.ts).toLocaleString("es-CL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                      </div>
                      <div style={{fontSize:mob?13:12.5,color:"#333",lineHeight:1.45}}>{c.text}</div>
                    </div>
                  </div>
                );})}
              </div>
              <div style={{display:"flex",gap:7,alignItems:"flex-end"}}>
                <textarea value={newComment} onChange={e=>setNew(e.target.value)} placeholder="Escribe un comentario..." rows={2}
                  style={{flex:1,padding: mob?"10px 12px":"7px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?15:12.5,fontFamily:"inherit",resize:"none",outline:"none"}}
                  onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){onAddComment(newComment);setNew("");}}}/>
                <button onClick={()=>{onAddComment(newComment);setNew("");}} style={{background:"#1a2f63",color:"white",border:"none",borderRadius:7,padding: mob?"10px 14px":"7px 13px",cursor:"pointer",fontWeight:700,fontSize:mob?14:12,minHeight:mob?44:undefined}}>Enviar</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit ? (
          <div style={{padding: mob?"12px 16px 28px":"10px 18px",borderTop:"1px solid #ebebeb",display:"flex",justifyContent:"space-between",gap:7,background:"#fafafa",borderRadius:`0 0 ${mob?0:12}px ${mob?0:12}px`,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:7}}>
              <button onClick={onDuplicate} style={{background:"white",border:"1.5px solid #dad6cc",borderRadius:7,padding: mob?"8px 14px":"6px 12px",cursor:"pointer",fontSize:mob?13:12,fontWeight:600,color:"#555",minHeight:mob?42:undefined}}>📋 Duplicar</button>
              {!task.fixed && (confirmDel ?
                <><button onClick={()=>onDelete(task.id)} style={{background:"#8a2438",color:"white",border:"none",borderRadius:7,padding: mob?"8px 12px":"6px 11px",cursor:"pointer",fontSize:mob?13:12,fontWeight:700,minHeight:mob?42:undefined}}>Sí, eliminar</button>
                  <button onClick={()=>setConfirmDel(false)} style={{background:"white",border:"1.5px solid #ccc",borderRadius:7,padding: mob?"8px 12px":"6px 11px",cursor:"pointer",fontSize:mob?13:12,minHeight:mob?42:undefined}}>Cancelar</button></> :
                <button onClick={()=>setConfirmDel(true)} style={{background:"white",border:"1.5px solid #f0c0c0",borderRadius:7,padding: mob?"8px 14px":"6px 12px",cursor:"pointer",fontSize:mob?13:12,fontWeight:600,color:"#c0392b",minHeight:mob?42:undefined}}>🗑 Eliminar</button>
              )}
            </div>
            <button onClick={()=>{
              if(showRecurr && recurrPreview.length>0) {
                // Guardar tarea original
                onSave(draft);
                // Crear copias recurrentes
                recurrPreview.forEach(d=>{
                  const copy = {
                    ...draft,
                    id: `t_rec_${Date.now()}_${d.getTime()}`,
                    day: d.getDate(),
                    month: d.getMonth()+1,
                    fixed: false,
                    status: "pendiente",
                  };
                  onSave(copy);
                });
              } else {
                onSave(draft);
              }
            }} style={{background:"#1a2f63",color:"white",border:"none",borderRadius:7,padding: mob?"9px 20px":"7px 18px",cursor:"pointer",fontSize:mob?15:13,fontWeight:700,minHeight:mob?42:undefined}}>
              {showRecurr && recurrPreview.length>0 ? `Guardar + ${recurrPreview.length} copias` : "Guardar"}
            </button>
          </div>
        ) : mob && (
          <div style={{padding:"12px 16px 28px",borderTop:"1px solid #ebebeb",background:"#fafafa"}}>
            <button onClick={onClose} style={{width:"100%",background:"#1a2f63",color:"white",border:"none",borderRadius:10,padding:"13px",cursor:"pointer",fontSize:15,fontWeight:700}}>
              ✕ Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAST DAYS BLOCK — días pasados agrupados
// ─────────────────────────────────────────────
function PastDaysBlock({days, month, monthTasks, comments, currentUser, setActiveTask, dupTarget, handleDupClick}) {
  const [expanded, setExpanded] = useState(false);
  const totalTasks = days.reduce((acc,d)=>acc+monthTasks(month,d).length,0);
  const DOWLABELS = ["Lun","Mar","Mié","Jue","Vie"];

  return (
    <div style={{marginBottom:8}}>
      {/* Header colapsable */}
      <button onClick={()=>setExpanded(e=>!e)}
        style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:"#edecea",border:"1px solid #d0cdc8",borderRadius:expanded?"8px 8px 0 0":8,cursor:"pointer",textAlign:"left",marginBottom:0}}>
        <span style={{fontSize:11,fontFamily:"monospace",fontWeight:700,color:"#888"}}>{expanded?"▲":"▼"}</span>
        <span style={{fontSize:12,fontWeight:700,color:"#888"}}>
          Días pasados ({days[0]}–{days[days.length-1]} de {["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][month]})
        </span>
        <span style={{marginLeft:"auto",fontSize:11,color:"#aaa",fontWeight:500}}>
          {days.length} días · {totalTasks} tareas
        </span>
        <span style={{fontSize:11,background:"#ccc",color:"#666",borderRadius:10,padding:"1px 8px",fontWeight:700}}>
          {expanded?"Colapsar":"Ver detalle"}
        </span>
      </button>

      {expanded && (
        <div style={{border:"1px solid #d0cdc8",borderTop:"none",borderRadius:"0 0 8px 8px",padding:"10px",background:"#f5f3ee",display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
          {days.map(d=>{
            const dow   = getDOW(month,d);
            const fer   = isFeriado(month,d);
            const dTasks = monthTasks(month,d);
            return (
              <div key={d}
                style={{background:"#edecea",border:"1px solid #d0cdc8",borderLeft:dow===0?"3px solid #b0aea8":undefined,borderRadius:6,minHeight:70,padding:"5px 6px",opacity:.75,cursor:dupTarget?"crosshair":"default"}}
                onClick={()=>{ if(dupTarget) handleDupClick(d); }}
              >
                <div style={{fontFamily:"monospace",fontWeight:700,fontSize:11.5,color:"#999",marginBottom:3,display:"flex",alignItems:"center",gap:4}}>
                  {d}
                  <span style={{fontSize:9,color:"#bbb",fontWeight:500}}>{DOWLABELS[dow]}</span>
                  {fer&&<span style={{fontSize:8,color:"#bbb",fontStyle:"italic"}}>{fer.label.split(" ")[0]}</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {dTasks.map(task=>(
                    <TaskChip key={task.id} task={task} hasComment={!!(comments[task.id]?.length)}
                      draggable={false} onDragStart={()=>{}} onDragEnd={()=>{}}
                      onClick={e=>{e.stopPropagation();if(!dupTarget)setActiveTask(task);}}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// NOTIF PANEL
// ─────────────────────────────────────────────
function NotifPanel({notifs, onClose, onMarkRead, onMarkAll}) {
  const unread = notifs.filter(n=>!n.read).length;
  const typeIcon = (type) => type==="nueva_tarea"?"📋":"👤";
  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff/60000);
    if(mins<1) return "ahora";
    if(mins<60) return `${mins}m`;
    const hrs = Math.floor(mins/60);
    if(hrs<24) return `${hrs}h`;
    return `${Math.floor(hrs/24)}d`;
  };
  const creatorName = (uid) => { const u=USERS.find(u=>u.id===uid); return u?u.name.split(" ")[0]:uid; };
  const typeColor = (type) => type==="nueva_tarea"?"#1a2f63":"#5b3f8c";
  const typeBg    = (type) => type==="nueva_tarea"?"#dfe7f7":"#ece5f5";
  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,width:360,background:"white",
      boxShadow:"-4px 0 32px rgba(0,0,0,.2)",zIndex:300,display:"flex",flexDirection:"column",
      borderLeft:"1px solid #e0ddd8"}}>
      <div style={{background:"#1a2f63",color:"white",padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div>
          <div style={{fontWeight:800,fontSize:15}}>🔔 Notificaciones</div>
          {unread>0&&<div style={{fontSize:11,opacity:.7,marginTop:2}}>{unread} sin leer</div>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {unread>0&&<button onClick={onMarkAll} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",color:"white",fontSize:11,padding:"5px 10px",borderRadius:6,cursor:"pointer",fontWeight:600}}>✓ Todas leídas</button>}
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",color:"white",cursor:"pointer",fontSize:20,width:32,height:32,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
      </div>
      {unread>0&&(
        <div style={{background:"#e34948",color:"white",padding:"8px 18px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:16}}>🔴</span>
          Tienes {unread} notificación{unread>1?"es":""} pendiente{unread>1?"s":""}
        </div>
      )}
      <div style={{flex:1,overflowY:"auto"}}>
        {notifs.length===0&&(
          <div style={{padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔕</div>
            <div style={{color:"#aaa",fontSize:14,fontWeight:600}}>Sin notificaciones</div>
            <div style={{color:"#ccc",fontSize:12,marginTop:4}}>Todo está al día</div>
          </div>
        )}
        {notifs.map((n,i)=>(
          <div key={n.id} onClick={()=>!n.read&&onMarkRead(n.id)}
            style={{padding:"14px 18px",borderBottom:"1px solid #f0ede8",
              background:n.read?"white":"#f8f9ff",cursor:n.read?"default":"pointer",
              display:"flex",gap:12,alignItems:"flex-start",
              borderLeft:`4px solid ${n.read?"transparent":typeColor(n.type)}`}}>
            <div style={{width:38,height:38,borderRadius:10,background:typeBg(n.type),
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
              {typeIcon(n.type)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12.5,color:"#272a33",lineHeight:1.45,fontWeight:n.read?400:600}}>{n.message}</div>
              <div style={{fontSize:11,color:"#aaa",marginTop:5,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{display:"flex",alignItems:"center",gap:4}}><Avatar uid={n.created_by} size={13}/>{creatorName(n.created_by)}</span>
                <span style={{fontFamily:"monospace"}}>{timeAgo(n.created_at)}</span>
              </div>
            </div>
            {!n.read&&<span style={{width:10,height:10,borderRadius:"50%",background:"#e34948",flexShrink:0,marginTop:4,boxShadow:"0 0 0 3px #fde8e8"}}/>}
          </div>
        ))}
      </div>
      <div style={{padding:"10px 18px",borderTop:"1px solid #ebebeb",background:"#fafaf8",flexShrink:0,fontSize:11,color:"#bbb",textAlign:"center"}}>
        Las notificaciones se actualizan cada 20 segundos
      </div>
    </div>
  );
}

function NotasWidget({currentUser}) {
  const mob = useIsMobile();
  const [open, setOpen]       = useState(false);
  const [content, setContent] = useState('');
  const [saved, setSaved]     = useState(true);
  const [loading, setLoading] = useState(false);
  const saveTimer             = useRef(null);
  const u = getUserById(currentUser?.id);

  useEffect(()=>{
    if(!currentUser) return;
    setLoading(true);
    sbFetch(`/notas?id=eq.${currentUser.id}`)
      .then(rows=>{ if(rows.length>0) setContent(rows[0].content||''); })
      .catch(e=>console.error(e))
      .finally(()=>setLoading(false));
  },[currentUser?.id]);

  function handleChange(val) {
    setContent(val); setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>save(val), 1500);
  }

  async function save(val) {
    if(!currentUser) return;
    try {
      await sbFetch('/notas?on_conflict=id', {method:'POST',
        body:JSON.stringify({id:currentUser.id, user_id:currentUser.id, content:val, updated_at:new Date().toISOString()}),
        headers:{...SB_H,'Prefer':'resolution=merge-duplicates,return=representation'}});
      setSaved(true);
    } catch(e){console.error(e);}
  }

  return (
    <>
      <button onClick={()=>setOpen(o=>!o)} title="Mis notas"
        style={{position:"fixed",bottom:mob?80:24,right:24,width:52,height:52,borderRadius:"50%",
          background:open?"#1a2f63":"white",color:open?"white":"#1a2f63",
          border:"2px solid #1a2f63",boxShadow:"0 4px 16px rgba(0,0,0,.18)",
          cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:150,transition:"all .2s"}}>
        📝
      </button>
      {open&&(
        <div style={{position:"fixed",bottom:mob?140:86,right:24,width:320,
          background:"white",borderRadius:14,boxShadow:"0 8px 40px rgba(0,0,0,.2)",
          zIndex:150,overflow:"hidden",border:"1px solid #e0ddd8",display:"flex",flexDirection:"column"}}>
          <div style={{background:"#1a2f63",color:"white",padding:"11px 14px",display:"flex",alignItems:"center",gap:8}}>
            <Avatar uid={currentUser.id} size={22}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13}}>Mis notas</div>
              <div style={{fontSize:9.5,opacity:.65}}>{u?.name}</div>
            </div>
            <div style={{fontSize:10,opacity:.65}}>{saved?"✓ guardado":"guardando..."}</div>
          </div>
          <textarea value={loading?"Cargando...":content} onChange={e=>handleChange(e.target.value)}
            disabled={loading}
            placeholder={"Escribe aquí tus notas, pendientes o recordatorios...\n\nEjemplo:\n• Revisar cierre\n• Llamar a Eduardo\n• Agendar reunión lunes"}
            style={{width:"100%",height:260,padding:"12px 14px",border:"none",outline:"none",
              resize:"none",fontSize:13,fontFamily:"'Segoe UI',sans-serif",lineHeight:1.6,
              color:"#272a33",background:"#fafaf8"}}/>
          <div style={{padding:"8px 14px",borderTop:"1px solid #f0ede8",background:"white",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:10.5,color:"#bbb"}}>{content.length} caracteres</span>
            <button onClick={()=>handleChange('')}
              style={{background:"none",border:"none",color:"#ccc",fontSize:11,cursor:"pointer",padding:"2px 6px",borderRadius:4}}>
              Limpiar
            </button>
          </div>
        </div>
      )}
    </>
  );
}


function LoginScreen({users, onLogin}) {
  const mob = useIsMobile();
  // Ordenar por apellido (segunda palabra del nombre)
  const sorted = [...users].sort((a,b)=>{
    const apellidoA = a.name.split(" ").slice(1).join(" ").toLowerCase();
    const apellidoB = b.name.split(" ").slice(1).join(" ").toLowerCase();
    return apellidoA.localeCompare(apellidoB, "es");
  });
  return (
    <div style={{minHeight:"100vh",background:"#1a2f63",display:"flex",alignItems:"center",justifyContent:"center",padding:mob?16:20}}>
      <div style={{background:"white",borderRadius:14,padding:mob?24:32,maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <div style={{textAlign:"center",marginBottom:mob?20:24}}>
          <div style={{fontSize:32,marginBottom:8}}>⛏️</div>
          <div style={{fontSize:10,fontFamily:"monospace",fontWeight:700,letterSpacing:.15,textTransform:"uppercase",color:"#aaa",marginBottom:7}}>Control de Gestión · 2026</div>
          <div style={{fontSize:mob?18:20,fontWeight:800,color:"#1a2f63"}}>Planificación del equipo</div>
          <div style={{fontSize:12.5,color:"#999",marginTop:6}}>Selecciona tu nombre para continuar</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sorted.map(u=>(
            <button key={u.id} onClick={()=>onLogin(u)}
              style={{display:"flex",alignItems:"center",gap:11,padding:mob?"13px 16px":"11px 15px",border:"2px solid #e8e8e8",borderRadius:10,background:"white",cursor:"pointer",textAlign:"left",minHeight:mob?56:undefined}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=u.color;e.currentTarget.style.background=u.color+"0D";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e8e8";e.currentTarget.style.background="white";}}>
              <Avatar uid={u.id} size={mob?38:34}/>
              <div style={{fontWeight:700,fontSize:mob?15:13.5,color:"#1a2f63"}}>{u.name}</div>
              <span style={{marginLeft:"auto",fontSize:mob?18:13,color:"#ccc"}}>›</span>
            </button>
          ))}
        </div>
        <div style={{marginTop:16,fontSize:11,color:"#ccc",textAlign:"center",lineHeight:1.5}}>
          Datos compartidos en tiempo real · RedSalud 2026
        </div>
      </div>
    </div>
  );
}

function Splash() {
  return <div style={{minHeight:"100vh",background:"#1a2f63",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:14,fontFamily:"monospace",letterSpacing:.05}}>Conectando con Supabase...</div>;
}

function SyncDot({status}) {
  const cfg={saving:{bg:"#f0c040",anim:"pulse 1s infinite",label:"Guardando..."},error:{bg:"#e05050",anim:"none",label:"Error"},idle:{bg:"#4caf80",anim:"none",label:"Sync ✓"}};
  const c=cfg[status]||cfg.idle;
  return <span style={{display:"flex",alignItems:"center",gap:4,fontSize:10,opacity:.75}}><span style={{width:7,height:7,borderRadius:"50%",background:c.bg,display:"inline-block",animation:c.anim}}/>{c.label}</span>;
}

function Toast({msg}) {
  return <div style={{position:"fixed",bottom:70,left:"50%",transform:"translateX(-50%)",background:"#1a2f63",color:"white",padding:"9px 18px",borderRadius:8,fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 16px rgba(0,0,0,.25)",animation:"fadeUp .2s",whiteSpace:"nowrap"}}>{msg}</div>;
}

function Btn({active, onClick, children}) {
  return <button onClick={onClick} style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${active?"#1a2f63":"#dad6cc"}`,background:active?"#1a2f63":"white",color:active?"white":"#5b5f6b",cursor:"pointer",fontSize:12,fontWeight:600,transition:"all .12s",minHeight:32}}>{children}</button>;
}

function Field({label, children}) {
  return <div><div style={{fontSize:10,fontWeight:700,letterSpacing:.07,textTransform:"uppercase",color:"#aaa",marginBottom:6}}>{label}</div>{children}</div>;
}
