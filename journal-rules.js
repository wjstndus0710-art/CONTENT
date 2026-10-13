// Validation shared by the Node server and the Netlify function.
export const validDate=value=>{const d=new Date(`${value}T00:00:00Z`);return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value;};
export const invalidTasks=tasks=>!Array.isArray(tasks) || tasks.length>100 || tasks.some(t=>!t || typeof t!=='object' || Array.isArray(t) || typeof t.text!=='string' || !t.text.trim() || t.text.length>500 || typeof t.done!=='boolean' || Object.keys(t).some(k=>!['text','done'].includes(k)));
export const isMonday=value=>validDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay()===1;
