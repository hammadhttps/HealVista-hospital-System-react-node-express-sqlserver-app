import app from "./app.js";
const s = (app as any)._router?.stack || [];
console.log("stack:", s.length);
s.forEach((l: any, i: number) => {
  const p = l.route?.path || l.regexp?.toString() || l.name;
  console.log(" ", i, p);
});
