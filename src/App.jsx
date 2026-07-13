import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────
const SB_URL = "https://aemsibavanjertkiznko.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlbXNpYmF2YW5qZXJ0a2l6bmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTQwNDIsImV4cCI6MjA5OTI5MDA0Mn0.bVIy1Fmg3p2m73LT8F1xzFZTGkmc0EUgEfsTYP--iCk";
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
    body: JSON.stringify({id:t.id,day:t.day,month:t.month||7,type:t.type,title:t.title,resp:t.resp,notes:t.notes||null,fixed:!!t.fixed}),
    headers:{...SB_H,"Prefer":"resolution=merge-duplicates,return=representation"}}),
  deleteTask:  (id)=> sbFetch(`/tasks?id=eq.${id}`, {method:"DELETE"}),
  addComment:  (taskId,uid,text)=> sbFetch("/comments",{method:"POST",body:JSON.stringify({task_id:taskId,user_id:uid,text})}),
  seedTasks:   async(tasks)=>{ await sbFetch("/tasks?id=neq.NONE",{method:"DELETE"}); for(const t of tasks) await db.upsertTask(t); },
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
  {id:"t16", month:7, day:6,  type:"cuad",       title:"Cuadratura y apertura ICEO",             resp:["joa","iso"]},
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
  {id:"t39", month:7, day:13, type:"cuad",       title:"Cuadratura y apertura ICEO",             resp:["joa","iso"]},
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
  {id:"t51", month:7, day:20, type:"cuad",       title:"Cuadratura y apertura ICEO",             resp:["joa","iso"]},
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
  {id:"t68", month:7, day:27, type:"cuad",       title:"Cuadratura y apertura ICEO",             resp:["joa","iso"]},
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
  { month:"JULIO 2026", color:"#1a2f63", items:[
    {date:"06 jul", bg:"#b9711b", label:"Levantamiento final CAPEX (interno)", desc:"Cierre del trabajo interno del equipo, previo al plazo de la clínica. Responsable: Daniela Riffo."},
    {date:"07 jul", bg:"#2e6b3a", label:"Lanzamiento PPA", desc:"Responsables: Eduardo Morales y Leonardo Ortiz."},
    {date:"08 jul", bg:"#1a2f63", label:"Cierre de mes + avance carta auditores", desc:"Provisión contable consolidada con indicadores; revisión de control interno. Responsables: Bastián Retamal y Leonardo Ortiz."},
    {date:"08 jul", bg:"#3b4d8c", label:"Oferta Consulta Médica y Quirúrgica", desc:"Responsables: Isidora Sepúlveda y Leonardo Ortiz."},
    {date:"10 jul", bg:"#b9711b", label:"Plazo final CAPEX — clínica", desc:"Fecha límite definida por la clínica para la entrega. Responsable: Daniela Riffo."},
    {date:"15 jul", bg:"#3b4d8c", label:"Ticket Médico Quirúrgico", desc:"Resp. Isidora. Cirugía general, cardiología, traumatología, otorrino."},
    {date:"22 jul", bg:"#3b4d8c", label:"Análisis de oferta oncológica", desc:"Responsable: Leonardo Ortiz."},
    {date:"30 jul", bg:"#8a2438", label:"Comité — sí presentamos", desc:"Responsables: Bastián Retamal y Leonardo Ortiz."},
    {date:"31 jul", bg:"#a3265c", label:"Reporte Mensual ILC", desc:"Responsable: Bastián Retamal."},
  ]},
  { month:"AGOSTO 2026", color:"#1d6b53", items:[
    {date:"01 ago →", bg:"#5b3f8c", label:"Inicio Presupuesto Clínica 2027", desc:"Arranca el proceso anual, liderado por Control de Gestión.", span:true},
    {date:"10 ago", bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"18 ago", bg:"#0e6e74", label:"Business Review — trimestral / YTD", desc:"Tercer martes. Revisión trimestral y acumulada del año."},
    {date:"19 ago", bg:"#1a2f63", label:"Comité Financiero — Master Plan", desc:"Reagendado desde julio. Revisión del plan maestro de inversión."},
    {date:"20 ago", bg:"#8a2438", label:"Comité — no presentamos", desc:"Penúltimo jueves del mes. No le corresponde a Control de Gestión exponer."},
    {date:"31 ago", bg:"#2e6b3a", label:"PPA", desc:"Seguimiento del lanzamiento. Responsables: Eduardo Morales y Leonardo Ortiz."},
  ]},
  { month:"SEPTIEMBRE 2026", color:"#5b3f8c", items:[
    {date:"08 sep", bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"24 sep", bg:"#8a2438", label:"Comité — sí presentamos", desc:"Le corresponde a Control de Gestión exponer."},
    {date:"todo el mes", bg:"#5b3f8c", label:"Presupuesto Clínica 2027 — desarrollo", desc:"Construcción y validación, en paralelo al ritmo mensual.", span:true},
  ]},
  { month:"OCTUBRE 2026", color:"#b9711b", items:[
    {date:"08 oct", bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil del mes."},
    {date:"15 oct", bg:"#6b6f78", label:"1:1 — conversaciones uno a uno", desc:"Tercer jueves del mes."},
    {date:"22 oct", bg:"#8a2438", label:"Comité — no presentamos", desc:"Penúltimo jueves del mes."},
    {date:"todo el mes", bg:"#5b3f8c", label:"Presupuesto 2027 — desarrollo", desc:"Última etapa, previa al cierre de la 1ª semana de noviembre.", span:true},
  ]},
  { month:"NOV · DIC 2026", color:"#8a2438", items:[
    {date:"→ 06 nov", bg:"#5b3f8c", label:"Cierre Presupuesto Clínica 2027", desc:"Consolidación final en la primera semana de noviembre.", span:true},
    {date:"09 nov", bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil de noviembre."},
    {date:"17 nov", bg:"#0e6e74", label:"Business Review — trimestral / YTD", desc:"Tercer martes. Siguiente revisión tras la de agosto."},
    {date:"19 nov", bg:"#8a2438", label:"Comité — sí presentamos", desc:"Penúltimo jueves del mes. Le corresponde a Control de Gestión exponer."},
    {date:"30 nov", bg:"#a3265c", label:"🎂 Cumpleaños Daniela Riffo", desc:""},
    {date:"01 dic", bg:"#1a2f63", label:"🎂 Cumpleaños Leonardo Ortiz", desc:""},
    {date:"09 dic", bg:"#1d6b53", label:"Reunión de cierre", desc:"6° día hábil de diciembre."},
    {date:"17 dic", bg:"#6b6f78", label:"1:1 — conversaciones uno a uno", desc:"Tercer jueves del mes. Última ronda del año."},
    {date:"19 dic", bg:"#2e6b3a", label:"🎂 Cumpleaños Eduardo Morales", desc:""},
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
  const [selectedMonth, setSelectedMonth] = useState(7);
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
  const mob = useIsMobile();
  const pollRef = useRef(null);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null),2500); };

  // ── Load ──
  async function loadFromDB(silent=false) {
    try {
      const [rawT, rawC] = await Promise.all([db.getTasks(), db.getComments()]);
      if(rawT.length===0) {
        await db.seedTasks(INITIAL_TASKS);
        setTasks(INITIAL_TASKS);
      } else {
        setTasks(rawT.map(t=>({...t, resp:Array.isArray(t.resp)?t.resp:(JSON.parse(t.resp||"[]"))})));
      }
      const grouped = {};
      rawC.forEach(c=>{ if(!grouped[c.task_id]) grouped[c.task_id]=[]; grouped[c.task_id].push({uid:c.user_id,text:c.text,ts:new Date(c.created_at).getTime()}); });
      setComments(grouped);
      if(!silent) setLoaded(true);
    } catch(e) {
      console.error(e);
      setTasks(INITIAL_TASKS); setComments({});
      if(!silent) setLoaded(true);
    }
  }
  useEffect(()=>{ loadFromDB(); },[]);
  useEffect(()=>{ pollRef.current=setInterval(()=>loadFromDB(true),15000); return ()=>clearInterval(pollRef.current); },[]);

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
    setActiveTask(nt);
  }
  async function saveTask(updated) {
    // Actualizar estado local inmediatamente
    setTasks(prev=>prev.map(t=>t.id===updated.id?updated:t));
    setActiveTask(updated);
    // Persistir en Supabase
    const ok = await persistTask(updated);
    if(ok) showToast("Guardado ✓");
    else showToast("⚠️ Error al guardar — intenta de nuevo");
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
  async function resetData() {
    if(!window.confirm("¿Resetear todos los datos?")) return;
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
    {n:2, icon:"🗺️", label:"Roadmap"},
    {n:3, icon:"⚠️", label:"Pendientes"},
    {n:4, icon:"📋", label:"ICEO + PM"},
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
            <Avatar uid={currentUser.id} size={26}/>
            <span style={{fontSize:11.5,opacity:.85}}>{currentUser.name.split(" ")[0]}</span>
            <span style={{fontSize:10,background:"rgba(255,255,255,.15)",padding:"2px 7px",borderRadius:10,color:"rgba(255,255,255,.75)"}}>{currentUser.role}</span>
            {currentUser.role==="admin" && <button onClick={resetData} style={{background:"rgba(255,60,60,.25)",border:"none",color:"white",fontSize:10,padding:"3px 8px",borderRadius:5,cursor:"pointer"}}>Reset</button>}
            <button onClick={()=>setCurrentUser(null)} style={{background:"rgba(255,255,255,.12)",border:"none",color:"white",fontSize:11,padding:"3px 9px",borderRadius:5,cursor:"pointer"}}>Salir</button>
          </div>
        </div>
      )}

      {/* ── MOBILE TOP BAR ── */}
      {mob && (
        <div style={{background:"#1a2f63",color:"white",height:50,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
          <span style={{fontWeight:800,fontSize:13}}>Control de Gestión</span>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <SyncDot status={syncStatus}/>
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
              {currentUser.role==="admin" && <button onClick={()=>{resetData();setMenuOpen(false);}} style={{width:"100%",background:"none",border:"none",color:"#ff9999",fontSize:13,padding:"12px 16px",cursor:"pointer",textAlign:"left"}}>🔄 Resetear datos</button>}
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
          showToast={showToast}
        />
      )}
      {page===2 && <RoadmapPage/>}
      {page===3 && <PendientesPage/>}
      {page===4 && <IceoPage/>}

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
function CalendarPage({tasks,comments,currentUser,selectedMonth,setSelectedMonth,monthTasks,filterType,setFilterType,filterResp,setFilterResp,showRutinas,setShowRutinas,dragSrc,setDragSrc,dragOver,setDragOver,dupTarget,setDupTarget,onDrop,handleDupClick,addTask,setActiveTask,showToast}) {
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

  const pad = mob ? "10px 12px 60px" : "14px 18px 40px";

  return (
    <div style={{padding:pad, maxWidth:1560, margin:"0 auto"}}>

      {/* Month selector — scrollable row on mobile */}
      <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:4,marginBottom:10}}>
        <div style={{display:"flex",gap:6,alignItems:"center",minWidth:"max-content"}}>
          <span style={{fontSize:10,fontWeight:700,letterSpacing:.1,textTransform:"uppercase",color:"#5b5f6b",marginRight:4,flexShrink:0}}>Mes:</span>
          {MONTHS.map(mo=>(
            <button key={mo.num} onClick={()=>setSelectedMonth(mo.num)}
              style={{padding: mob?"6px 12px":"5px 14px", borderRadius:20, border:`2px solid ${selectedMonth===mo.num?"#1a2f63":"#dad6cc"}`,
                background:selectedMonth===mo.num?"#1a2f63":"white", color:selectedMonth===mo.num?"white":"#5b5f6b",
                fontWeight:700, fontSize: mob?13:12, cursor:"pointer", flexShrink:0, minHeight:mob?36:undefined}}>
              {mo.label}
            </button>
          ))}
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

      {/* Month title */}
      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:mob?17:20,color:"#1a2f63",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>{m?.label} 2026</div>

      {dupTarget && mob && <div style={{fontSize:12,color:"#8a2438",fontWeight:700,animation:"pulse 1s infinite",marginBottom:8,padding:"8px 12px",background:"#f6e3e6",borderRadius:7}}>📋 Toca el día destino para duplicar</div>}

      {/* ── MOBILE: lista de días por semana ── */}
      {mob ? (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {workDays.map(d=>{
            const dow   = getDOW(selectedMonth,d);
            const fer   = isFeriado(selectedMonth,d);
            const isToday = isCurrentMonth && d === todayDay;
            const isPast  = isCurrentMonth ? d < todayDay : selectedMonth < todayMonth;
            const dTasks  = monthTasks(selectedMonth,d);
            const isDupMode = !!dupTarget;
            if(dTasks.length===0 && !isToday && !fer) return null;

            const DOWLABELS = ["Lun","Mar","Mié","Jue","Vie"];
            return (
              <div key={d}
                style={{
                  background: isPast?"#edecea": fer?"#f0ede6":dow===1?"#dfe7f7":"white",
                  border:`1.5px solid ${isToday?"#1a2f63":isPast?"#d0cdc8":"#e0ddd8"}`,
                  borderLeft:`4px solid ${dow===0?(isPast?"#b0aea8":"#1d6b53"):dow===1?(isPast?"#b0b8cc":"#1a2f63"):"#e0ddd8"}`,
                  borderRadius:8, padding:"10px 12px",
                  opacity: isPast?0.65:1,
                  cursor:isDupMode?"crosshair":"default",
                }}
                onClick={()=>{ if(isDupMode) handleDupClick(d); }}
              >
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:dTasks.length>0?7:0}}>
                  <span style={{fontFamily:"monospace",fontWeight:800,fontSize:15,color:isToday?"#1a2f63":isPast?"#999":"#272a33",minWidth:22}}>{d}</span>
                  <span style={{fontSize:11,color:isPast?"#bbb":"#999",fontWeight:600}}>{DOWLABELS[dow]}</span>
                  {isToday && <span style={{fontSize:9,background:"#1a2f63",color:"white",borderRadius:8,padding:"1px 6px",fontWeight:700}}>HOY</span>}
                  {isPast  && <span style={{fontSize:9,background:"#ddd",color:"#888",borderRadius:8,padding:"1px 6px",fontWeight:600}}>pasado</span>}
                  {fer && <span style={{fontSize:10,color:"#888",fontStyle:"italic"}}>{fer.label}</span>}
                  {!fer && !isPast && currentUser.role!=="viewer" && (
                    <button onClick={e=>{e.stopPropagation();addTask(d);}}
                      style={{marginLeft:"auto",background:"none",border:"1px dashed #bbb",borderRadius:5,width:26,height:26,cursor:"pointer",fontSize:16,color:"#bbb",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>+</button>
                  )}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {dTasks.map(task=>(
                    <TaskChipMobile key={task.id} task={task} hasComment={!!(comments[task.id]?.length)}
                      onClick={e=>{e.stopPropagation();if(!dupTarget)setActiveTask(task);}}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── DESKTOP: grid 5 columnas ── */
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:6}}>
            {WDAYS.map((w,i)=><div key={w} style={{textAlign:"center",fontFamily:"monospace",fontSize:10.5,fontWeight:700,letterSpacing:.1,color:i===0?"#1d6b53":i===1?"#1a2f63":"#5b5f6b",textTransform:"uppercase"}}>{w}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
            {Array.from({length:offset}).map((_,i)=><div key={"e"+i}/>)}
            {workDays.map(d=>{
              const dow  = getDOW(selectedMonth,d);
              const fer  = isFeriado(selectedMonth,d);
              const isToday = isCurrentMonth && d === todayDay;
              const isPast  = isCurrentMonth ? d < todayDay : selectedMonth < todayMonth;
              const dTasks = monthTasks(selectedMonth,d);
              const isDropOver = dragOver===`${selectedMonth}-${d}`;
              const isDupMode  = !!dupTarget;
              return (
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
                      />
                    ))}
                  </div>
                </div>
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
// PAGE 2 — ROADMAP
// ─────────────────────────────────────────────
function RoadmapPage() {
  const mob = useIsMobile();
  return (
    <div style={{padding: mob?"12px 12px 70px":"24px 32px 60px", maxWidth:1200, margin:"0 auto"}}>
      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:5}}>Control de Gestión · Visión hacia adelante</div>
      <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63",marginBottom:4}}>Roadmap <span style={{color:"#8a2438"}}>Jul – Dic 2026</span></div>
      <div style={{fontSize:12,color:"#5b5f6b",marginBottom:20}}>Hitos relevantes del segundo semestre.</div>
      <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:mob?12:24}}>
        {ROADMAP.map((section,si)=>(
          <div key={si} style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",overflow:"hidden"}}>
            <div style={{background:section.color,color:"white",padding:"9px 14px",fontFamily:"monospace",fontWeight:700,fontSize:mob?11:12,letterSpacing:.1,textTransform:"uppercase"}}>
              ● {section.month}
            </div>
            <div style={{padding:mob?"10px":"12px 14px",display:"flex",flexDirection:"column",gap:7}}>
              {section.items.map((item,ii)=>(
                <div key={ii} style={{display:"flex",gap:8,alignItems:"flex-start",background:item.span?"#f0ebfa":"#fafaf8",border:`1px solid ${item.span?"#d8c9ef":"#ebebeb"}`,borderRadius:7,padding:mob?"8px 10px":"9px 12px"}}>
                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:9.5,color:"white",background:item.bg,borderRadius:5,padding:"3px 6px",whiteSpace:"nowrap",flexShrink:0,height:"fit-content",marginTop:1}}>{item.date}</span>
                  <div>
                    <div style={{fontWeight:700,fontSize:mob?12:12.5,color:item.span?"#5b3f8c":"#1a2f63",marginBottom:item.desc?2:0}}>{item.label}</div>
                    {item.desc && <div style={{fontSize:10.5,color:"#777",lineHeight:1.4}}>{item.desc}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE 3 — PENDIENTES
// ─────────────────────────────────────────────
function PendientesPage() {
  const mob = useIsMobile();
  return (
    <div style={{padding: mob?"12px 12px 70px":"24px 32px 60px", maxWidth:900, margin:"0 auto"}}>
      <div style={{fontFamily:"monospace",fontSize:10,fontWeight:700,letterSpacing:.14,textTransform:"uppercase",color:"#5b5f6b",marginBottom:5}}>Control de Gestión · Solo visualización</div>
      <div style={{fontWeight:800,fontSize:mob?20:26,color:"#1a2f63",marginBottom:4}}>⚠️ Pendientes <span style={{color:"#8a2438"}}>estratégicos</span></div>
      <div style={{fontSize:12,color:"#5b5f6b",marginBottom:20}}>Para modificar este listado, contactar a Leonardo o Bastián.</div>
      <div style={{background:"white",borderRadius:10,border:"1px solid #dad6cc",overflow:"hidden"}}>
        <div style={{background:"#1a2f63",color:"white",padding:"11px 16px",fontWeight:800,fontSize:mob?13:14}}>📋 Listado de pendientes importantes</div>
        {PENDIENTES.map((p,i)=>(
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding: mob?"12px 14px":"14px 20px",borderBottom:i<PENDIENTES.length-1?"1px dashed #ebebeb":undefined,background:i%2===0?"#fafaf8":"white"}}>
            <span style={{fontFamily:"monospace",fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:.05,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap",flexShrink:0,marginTop:1,
              background:p.status==="en ajuste"?"#f7ead4":p.status==="listo"?"#e4f0ea":p.status==="no válido"?"#e8e8e8":"#f6e3e6",
              color:p.status==="en ajuste"?"#b9711b":p.status==="listo"?"#1d6b53":p.status==="no válido"?"#888":"#8a2438",
              border:`1px solid ${p.status==="en ajuste"?"#e0c080":p.status==="listo"?"#a0d0b0":p.status==="no válido"?"#ccc":"#d4a0a8"}`,
              textDecoration:p.status==="no válido"?"line-through":undefined,
            }}>{p.status}</span>
            <span style={{fontSize:mob?13:13.5,color:"#272a33",fontWeight:500,lineHeight:1.4}}>{p.label}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:16,background:"#f0ebfa",border:"1px solid #d8c9ef",borderRadius:8,padding:"12px 16px",fontSize:12,color:"#5b3f8c",lineHeight:1.6}}>
        <strong>Nota:</strong> Esta lista es de solo lectura en la app. Para agregar, modificar o marcar como completado, coordinarse con el Subgerente de Control de Gestión.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE 4 — ICEO + PM
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
            {sem:"4° Martes", gers:[{name:"Comercial",col:C.bas,items:["Convenios y aseguradoras","Licitaciones","Márgenes quirúrgicos"]},{name:"Marketing",col:C.dan,items:["Posicionamiento, campañas, captación"]}], obj:"Crecimiento sostenible y márgenes."},
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
                {sem:"4° Martes",gers:[{name:"Comercial",col:C.bas},{name:"Marketing",col:C.dan}],content:[["Convenios y aseguradoras","Licitaciones","Márgenes quirúrgicos"],["Posicionamiento, campañas, captación"]],obj:"Impulsar crecimiento sostenible a través de relaciones comerciales."},
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
              {dim:"2 · PACIENTE Y MERCADO",dimBg:"#1d6b53",rows:[{sub:"Comercial",d:["Presupuesto cantidad y concreción","TM de prestaciones"],s:["Presupuestos semanales: cantidad y concreción"],m:["Mix pacientes / aseguradoras","Convenios y contratos","Productos nuevos","Venta por aseguradora"],t:["Pipeline comercial","Rentabilidad por segmento","Estrategia comercial"],a:["Objetivos comerciales","Rentabilidad por segmento"],resp:"bas"},{sub:"Experiencia Pacientes",d:["NPS / Satisfacción","Tiempos de espera","Cantidad reclamos"],s:["NPS/88 consolidado","Reclamos y causa raíz","Recomendación global"],m:["Tendencia NPS","Planes de mejora"],t:["Objetivos experiencia","Benchmark"],a:["Objetivos experiencia","Benchmark"],resp:"bas"}]},
              {dim:"3 · PROCESOS Y OPERACIÓN",dimBg:"#5b3f8c",rows:[{sub:"Operacional · Eficiencia",d:["Productividad pabellón (%)","Productividad consultas","Uso insumos críticos"],s:["Productividad clínica global","Costo por paciente","Índice de suspensiones"],m:["Eficiencia por unidad","Productividad por especialidad","Variación costos operativos"],t:["Eficiencia consolidada","Proyectos de eficiencia"],a:["Objetivos eficiencia","Plan de productividad"],resp:"iso"},{sub:"Calidad",d:["IAAS","Eventos adversos","Mortalidad ajustada"],s:["Indicadores calidad clínica","Cumplimiento acreditación","Eventos centinela"],m:["Indicadores calidad","Cumplimiento acreditación","Eventos centinela"],t:["Resultados acreditación","Plan de calidad","Gestión riesgos"],a:["Objetivos calidad","Plan estratégico"],resp:"iso"},{sub:"CAPEX / Inversión",d:["Ejecución vs ppto","Avance físico diario (%)"],s:["Presupuesto vs real (%)","Avance físico obras (%)","Desviaciones principales"],m:["Ejecución acumulada vs ppto","Ejecución de contratos","Proyección término obras"],t:["ROI / Valor esperado","Revisión caso de inversión"],a:["Plan maestro 3-5 años","Ejecución inversiones"],resp:"dan"},{sub:"Marketing",d:["Leads por canal","Tráfico web / campañas"],s:["ROI campañas","Costo por leads","Tasa conversión"],m:["Performance multicanal","Branding y reputación","Posicionamiento de marca"],t:["Objetivos marketing","Plan de marketing anual"],a:["Objetivos marketing","Estrategia de marca"],resp:"dan"}]},
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
function TaskChip({task, hasComment, draggable, onDragStart, onDragEnd, onClick}) {
  const s = getTypeStyle(task.type);
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:3,background:s.bg,color:s.fg,borderRadius:4,padding:"2.5px 5px",fontSize:9.5,fontWeight:600,lineHeight:1.3,cursor:"pointer",userSelect:"none",border:`1px solid ${s.fg==="white"?s.bg+"80":"rgba(0,0,0,.07)"}`}}
      onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
      onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</span>
      {hasComment && <span style={{fontSize:8,opacity:.7}}>💬</span>}
      <span style={{display:"flex",flexShrink:0}}>
        {task.resp.slice(0,2).map(uid=><Avatar key={uid} uid={uid} size={11}/>)}
        {task.resp.length>2 && <span style={{fontSize:8,opacity:.7}}>+{task.resp.length-2}</span>}
      </span>
    </div>
  );
}

// Mobile-optimized task chip — bigger tap target, more readable
function TaskChipMobile({task, hasComment, onClick}) {
  const s = getTypeStyle(task.type);
  return (
    <div onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:8,background:s.bg,color:s.fg,borderRadius:7,padding:"8px 10px",fontSize:12,fontWeight:600,lineHeight:1.35,cursor:"pointer",userSelect:"none",border:`1px solid ${s.fg==="white"?s.bg+"80":"rgba(0,0,0,.07)"}`,minHeight:38}}>
      <span style={{flex:1,lineHeight:1.3}}>{task.title}</span>
      <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
        {hasComment && <span style={{fontSize:11}}>💬</span>}
        <span style={{display:"flex",gap:1}}>
          {task.resp.slice(0,3).map(uid=><Avatar key={uid} uid={uid} size={18}/>)}
          {task.resp.length>3 && <span style={{fontSize:10,opacity:.7}}>+{task.resp.length-3}</span>}
        </span>
        <span style={{fontSize:14,opacity:.4}}>›</span>
      </div>
    </div>
  );
}

function TaskModal({task, comments, currentUser, onClose, onSave, onDelete, onDuplicate, onAddComment, canEdit}) {
  const mob = useIsMobile();
  const [draft, setDraft] = useState({...task});
  const [newComment, setNew] = useState("");
  const [tab, setTab] = useState("edit");
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:20}} onClick={onClose}>
      <div
        style={{background:"white",borderRadius:mob?"16px 16px 0 0":"12px",width:"100%",maxWidth:mob?undefined:540,maxHeight:mob?"92vh":"88vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -4px 30px rgba(0,0,0,.2)"}}
        onClick={e=>e.stopPropagation()}>

        {/* Drag handle on mobile */}
        {mob && <div style={{width:40,height:4,background:"#ddd",borderRadius:2,margin:"10px auto 0",flexShrink:0}}/>}

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
              <Field label="Título">
                {canEdit ? <input value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} style={{width:"100%",padding: mob?"10px 12px":"7px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?16:13,fontFamily:"inherit",outline:"none"}}/> : <div style={{fontSize:13,padding:"3px 0"}}>{draft.title}</div>}
              </Field>
              <Field label="Reagendar — día">
                {canEdit ? (
                  <select value={draft.day} onChange={e=>setDraft(d=>({...d,day:parseInt(e.target.value)}))} style={{padding: mob?"10px 12px":"6px 10px",border:"1.5px solid #e0e0e0",borderRadius:7,fontSize:mob?16:13,background:"white",cursor:"pointer",width:"100%"}}>
                    {getWorkDays(draft.month||7).map(d=><option key={d} value={d}>Día {d}</option>)}
                  </select>
                ) : <div style={{fontSize:13}}>Día {draft.day}</div>}
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
        {canEdit && (
          <div style={{padding: mob?"12px 16px 20px":"10px 18px",borderTop:"1px solid #ebebeb",display:"flex",justifyContent:"space-between",gap:7,background:"#fafafa",borderRadius:`0 0 ${mob?0:12}px ${mob?0:12}px`,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:7}}>
              <button onClick={onDuplicate} style={{background:"white",border:"1.5px solid #dad6cc",borderRadius:7,padding: mob?"8px 14px":"6px 12px",cursor:"pointer",fontSize:mob?13:12,fontWeight:600,color:"#555",minHeight:mob?42:undefined}}>📋 Duplicar</button>
              {!task.fixed && (confirmDel ?
                <><button onClick={()=>onDelete(task.id)} style={{background:"#8a2438",color:"white",border:"none",borderRadius:7,padding: mob?"8px 12px":"6px 11px",cursor:"pointer",fontSize:mob?13:12,fontWeight:700,minHeight:mob?42:undefined}}>Sí, eliminar</button>
                  <button onClick={()=>setConfirmDel(false)} style={{background:"white",border:"1.5px solid #ccc",borderRadius:7,padding: mob?"8px 12px":"6px 11px",cursor:"pointer",fontSize:mob?13:12,minHeight:mob?42:undefined}}>Cancelar</button></> :
                <button onClick={()=>setConfirmDel(true)} style={{background:"white",border:"1.5px solid #f0c0c0",borderRadius:7,padding: mob?"8px 14px":"6px 12px",cursor:"pointer",fontSize:mob?13:12,fontWeight:600,color:"#c0392b",minHeight:mob?42:undefined}}>🗑 Eliminar</button>
              )}
            </div>
            <button onClick={()=>onSave(draft)} style={{background:"#1a2f63",color:"white",border:"none",borderRadius:7,padding: mob?"9px 20px":"7px 18px",cursor:"pointer",fontSize:mob?15:13,fontWeight:700,minHeight:mob?42:undefined}}>Guardar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginScreen({users, onLogin}) {
  const mob = useIsMobile();
  return (
    <div style={{minHeight:"100vh",background:"#1a2f63",display:"flex",alignItems:"center",justifyContent:"center",padding:mob?16:20}}>
      <div style={{background:"white",borderRadius:14,padding:mob?24:32,maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <div style={{textAlign:"center",marginBottom:mob?20:24}}>
          <div style={{fontSize:10,fontFamily:"monospace",fontWeight:700,letterSpacing:.15,textTransform:"uppercase",color:"#aaa",marginBottom:7}}>Control de Gestión · 2026</div>
          <div style={{fontSize:mob?18:20,fontWeight:800,color:"#1a2f63"}}>Planificación del equipo</div>
          <div style={{fontSize:12.5,color:"#999",marginTop:6}}>Selecciona tu usuario para continuar</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {users.map(u=>(
            <button key={u.id} onClick={()=>onLogin(u)}
              style={{display:"flex",alignItems:"center",gap:11,padding: mob?"13px 16px":"11px 15px",border:"2px solid #e8e8e8",borderRadius:10,background:"white",cursor:"pointer",textAlign:"left",minHeight:mob?56:undefined}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=u.color;e.currentTarget.style.background=u.color+"0D";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#e8e8e8";e.currentTarget.style.background="white";}}>
              <Avatar uid={u.id} size={mob?38:34}/>
              <div><div style={{fontWeight:700,fontSize:mob?15:13.5,color:"#1a2f63"}}>{u.name}</div><div style={{fontSize:11,color:"#bbb",textTransform:"capitalize"}}>{u.role}</div></div>
              <span style={{marginLeft:"auto",fontSize:mob?18:13,color:"#ccc"}}>›</span>
            </button>
          ))}
        </div>
        <div style={{marginTop:16,fontSize:11,color:"#ccc",textAlign:"center",lineHeight:1.5}}>Admin: edición completa · Editor: mover y comentar<br/>Datos en tiempo real vía Supabase</div>
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
