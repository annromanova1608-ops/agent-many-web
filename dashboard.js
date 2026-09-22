'use strict';
/* Presentation only: aggregates come from /api/analytics; the current
   distribution uses the already-authorized /api/leads snapshot. */
function dashboardNumber(v, money=false){
 return v==null?'Неизвестно':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:money?2:0}).format(v)+(money?' ₽':'');
}
function dashboardMetric(key,label,val,note,money=false){
 const card=el('article',null,'monitor-kpi');card.dataset.metric=key;card.dataset.value=val==null?'unknown':String(val);
 card.append(el('span',label,'monitor-label'),el('strong',dashboardNumber(val,money),'monitor-value'),el('small',note,'monitor-note'));return card;
}
function dashboardPanel(title,kicker,cls=''){
 const panel=el('section',null,'monitor-panel '+cls);const head=el('header',null,'monitor-panel-head');head.append(el('span',kicker,'monitor-kicker'),el('h3',title));panel.append(head);return panel;
}
function renderDashboard(output,a,scope,statuses){
 const fragment=document.createDocumentFragment();
 const kpis=el('div',null,'monitor-kpis');kpis.id='dashboard-kpis';
 kpis.append(dashboardMetric('paid_revenue','Оплаты периода',a.paid_revenue,'Только подтверждённые платежи',true),dashboardMetric('paid_count','Оплатившие за период',a.paid_count,'Клиенты с подтверждённой оплатой'),dashboardMetric('potential_confirmed','Подтверждённый потенциал',a.potential_confirmed,'Сейчас · потенциал + офферы, не выручка',true),dashboardMetric('work_count','Сейчас «В работе»',a.work_count,'Клиентов · без ограничения периодом'));
 fragment.append(kpis);
 const quality=el('aside',null,'monitor-quality');quality.id='dashboard-quality';quality.setAttribute('aria-label','Качество данных');
 const uncertain=Number(a.potential_unverified_count)>0||Number(a.unknown_imports)>0;
 quality.classList.toggle('needs-review',uncertain);
 quality.append(el('strong',uncertain?'!  Данные требуют проверки':'✓  Контроль данных','monitor-quality-title'));
 const qualityValues=el('div',null,'monitor-quality-values');
 for(const [key,label] of [['potential_unverified_count','Непроверенные суммы'],['unknown_imports','Импорт с неизвестной датой события']]){
  const item=el('span',label+': '+dashboardNumber(a[key]));item.dataset.metric=key;item.dataset.value=a[key]==null?'unknown':String(a[key]);qualityValues.append(item);
 }
 quality.append(qualityValues,el('small','Не включены в подтверждённый потенциал: непроверенные суммы. Недатированный импорт не участвует в показателях периода; счётчик импорта — по всей доступной базе.'));
 fragment.append(quality);
 const columns=el('div',null,'monitor-columns');
 const pipeline=dashboardPanel('Распределение карточек','01 / Текущий срез','monitor-pipeline');pipeline.id='dashboard-pipeline';pipeline.dataset.total=String(scope.length);
 const counts=new Map([...new Set([...statuses,...scope.map(l=>l.status)])].map(s=>[s,0]));scope.forEach(l=>counts.set(l.status,(counts.get(l.status)||0)+1));
 const palette=['#b9d879','#92b761','#e3ce94','#86b89b','#d2b46e','#9d9e80','#b5ca81','#c49e65','#71978a','#979b68','#dfeab0','#b18170'];
 const summary=el('div',null,'monitor-pipeline-summary');
 const ring=el('div',null,'monitor-ring');ring.setAttribute('aria-hidden','true');let cursor=0;const stops=[];
 [...counts].forEach(([s,n],i)=>{const next=cursor+(scope.length?n/scope.length*100:0);if(n)stops.push(`${palette[i%palette.length]} ${cursor}% ${next}%`);cursor=next;});
 if(stops.length)ring.style.background=`conic-gradient(${stops.join(',')})`;
 const core=el('div',null,'monitor-ring-core');core.append(el('strong',String(scope.length)),el('small','карточек'));ring.append(core);
 const summaryText=el('div');summaryText.append(el('strong','Вся воронка сейчас'),el('p','По ответственному. Не зависит от периода.','monitor-note'));summary.append(ring,summaryText);pipeline.append(summary);
 if(!scope.length)pipeline.append(el('p','Нет карточек у выбранного ответственного.','monitor-empty'));
 const distribution=el('div',null,'monitor-distribution');distribution.setAttribute('aria-label','Количество карточек по текущему статусу');
 [...counts].forEach(([status,n],i)=>{
  const row=el('div',null,'monitor-status');row.dataset.status=status;row.dataset.count=String(n);
  const label=el('span',status);const count=el('b',String(n));const track=el('div',null,'monitor-status-track');track.setAttribute('aria-hidden','true');const fill=el('i');fill.style.width=(scope.length?n/scope.length*100:0)+'%';fill.style.background=palette[i%palette.length];track.append(fill);row.append(label,count,track);distribution.append(row);
 });pipeline.append(distribution);columns.append(pipeline);
 const conversions=dashboardPanel('Конверсии по этапам','02 / Выбранный период','monitor-conversions');
 const active=el('p','Активные лиды: '+dashboardNumber(a.active_leads),'monitor-cohort');active.dataset.metric='active_leads';active.dataset.value=a.active_leads==null?'unknown':String(a.active_leads);conversions.append(active);
 for(const [key,v] of Object.entries(a.conversions)){
  const row=el('div',null,'monitor-conversion');row.dataset.conversion=key;
  const head=el('div',null,'monitor-conversion-head');head.append(el('span',conversionNames[key]||key),el('strong',v.rate==null?'Неизвестно':(v.rate*100).toFixed(1)+'%'));
  const track=el('div',null,'monitor-track');track.setAttribute('aria-hidden','true');
  if(v.rate==null)track.classList.add('unknown');else{const fill=el('i');fill.style.width=Math.max(0,Math.min(100,v.rate*100))+'%';track.append(fill);}
  row.append(head,track,el('small',`${value(v.numerator)}/${value(v.denominator)} · ${v.rate==null?'Недостаточно истории':'Переходы / исходный этап'}`,'monitor-note'));conversions.append(row);
 }
 columns.append(conversions);
 const side=el('div',null,'monitor-side');
 const focus=dashboardPanel('В фокусе','03 / Сейчас');
 const potential=dashboardMetric('potential_count','Потенциал + офферы',a.potential_count,'Клиентов сейчас · суммы выше');potential.classList.add('monitor-compact');focus.append(potential);
 for(const [key,v] of Object.entries(a.current)){
  const row=el('div',null,'monitor-focus-row');row.dataset.current=key;row.append(el('span',key==='overdue'?'Просрочено':key),el('strong',dashboardNumber(v)));if(key==='overdue'&&v>0)row.classList.add('is-overdue');focus.append(row);
 }
 side.append(focus);
 const timing=dashboardPanel('Скорость сделки','04 / Среднее время');
 for(const [key,v] of Object.entries(a.timing_hours)){
  const row=el('div',null,'monitor-timing');row.dataset.timing=key;row.append(el('span',conversionNames[key]||key),el('strong',v==null?'Неизвестно':v.toFixed(1)+' ч'),el('small',v==null?'Нет датированной пары событий':'Средние часы · активная когорта','monitor-note'));timing.append(row);
 }side.append(timing);columns.append(side);fragment.append(columns);
 const methodology=el('details',null,'monitor-methodology');methodology.append(el('summary','Как читать показатели'),el('p','Конверсии: история активной когорты за выбранный период; порядок этапов обязателен. Оплатившие — подтверждённые платежи периода по автору события. Текущие потенциал и «В работе» — по ответственному, без ограничения периодом; потенциал не взвешивается вероятностью. Распределение — текущие статусы доступных карточек, а не динамика продаж. «Неизвестно» означает недостаток датированной истории, а не нулевую конверсию.'));
 fragment.append(methodology);output.replaceChildren(fragment);
}
