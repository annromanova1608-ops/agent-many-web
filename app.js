'use strict';
const $=id=>document.getElementById(id);
const cfg=window.AGENT_MANY_CONFIG||{};
const API_BASE=(cfg.API_BASE||'').replace(/\/$/,'');
const tg=window.Telegram?.WebApp;
const initData=tg?.initData||'';
let me,leads=[],selected=null,alerts={},onlyAttention=false,reloadReport=null,refreshTimer=null;
const roleNames={manager:'Руководитель',sales_manager:'Продажник',lead_collector:'Сборщик контактов',producer:'Продюсер'};
async function visibleRefresh(){
 const b=$('reload');if(b.disabled)return;clearTimeout(refreshTimer);
 b.disabled=true;b.setAttribute('aria-busy','true');b.classList.add('refreshing');b.classList.remove('refreshed');b.textContent='↻ Обновляю…';
 $('error').hidden=true;$('refresh-status').hidden=false;$('refresh-status').textContent='Обновляю данные с сервера…';
 try{
  await refresh();if(!$('report').hidden&&reloadReport)await reloadReport();
  b.textContent='✓ Обновлено';b.classList.add('refreshed');
  $('refresh-status').textContent='Данные обновлены в '+new Date().toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow'})+' (МСК)';
  refreshTimer=setTimeout(()=>{b.textContent='Обновить';b.classList.remove('refreshed');},2200);
 }catch(e){b.textContent='Повторить обновление';$('refresh-status').textContent='Не удалось обновить данные. Попробуйте ещё раз.';showError(e);}
 finally{b.disabled=false;b.setAttribute('aria-busy','false');b.classList.remove('refreshing');}
}
const names={name:'Имя',telegram:'Telegram',source:'Источник',industry:'Отрасль',capital:'Капитал',request:'Запрос',comment:'Комментарий',potential_amount:'Потенциальная сумма, ₽',offer_amount:'Сумма оффера, ₽',paid_amount:'Фактическая оплата, ₽',probability:'Вероятность, %',next_action:'Следующее действие',next_at:'Дата действия (Москва)',expected_payment_at:'Ожидаемая оплата (Москва)',postponed_reason:'Причина переноса',not_target_reason:'Причина «Не ЦА»',client_category:'Категория клиента',category_mismatch:'Несоответствие категории',refusal_reason:'Причина отказа',alternative_product:'Альтернативный продукт / нет',payment_method:'Способ оплаты',result:'Что сделано'};
const requirements={'Потенциал':['potential_amount','probability','next_action','next_at','industry','capital','request'],'Оффер':['offer_amount','next_action','expected_payment_at'],'Думает':['next_action','next_at'],'Повторный контакт':['next_action','next_at'],'Отложено':['postponed_reason','next_at','next_action'],'Не ЦА':['not_target_reason','client_category','category_mismatch'],'Отказ':['refusal_reason','comment','alternative_product'],'Оплатил':['paid_amount','payment_method'],'Назначен созвон':['next_action','next_at']};
const reasons={offer_followup:'Оффер: нужен контакт сегодня',repeat_due:'Пора повторно связаться',overdue:'Просроченная задача',unqualified_call:'Квалифицируйте созвон',paid_handoff:'Передайте руководителю'};
function el(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,fn,cls='btn'){const b=el('button',text,cls);b.type='button';b.onclick=()=>Promise.resolve(fn()).catch(showError);return b;}
function showError(e){$('error').hidden=false;$('error').textContent=e.message||String(e);}
function value(v){return v===null||v===undefined||v===''?'Неизвестно':String(v);}
function date(v){return v?new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'Дата неизвестна';}
async function api(path,body){
  const r=await fetch(API_BASE+path,{method:body?'POST':'GET',headers:{Authorization:'tma '+initData,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store'});
  const data=await r.json();if(!r.ok){if(r.status===401){$('workspace').hidden=true;$('login').hidden=false;}throw Error(typeof data.detail==='string'?data.detail:'Не удалось выполнить запрос');}return data;
}
async function refresh(){[leads,alerts]=await Promise.all([api('/api/leads'),api('/api/attention')]);alerts=Object.fromEntries(alerts.map(x=>[x.lead.id,x.reasons]));renderList();if(selected){selected=leads.find(x=>x.id===selected.id)||null;if(selected)await detail(selected.id);else $('detail').replaceChildren(el('p','Карточка передана или недоступна'));}}
function selectNavigation(id){for(const key of ['all','attention','analytics']){$(key).setAttribute('aria-pressed',String(key===id));$(key).classList.toggle('primary',key===id);}}
function showList(attentionOnly){
 onlyAttention=attentionOnly;$('report').hidden=true;$('search').value='';$('filter').value='';
 selectNavigation(attentionOnly?'attention':'all');renderList();$('list-panel').scrollIntoView({block:'start'});
}
function renderList(){
 $('list-title').textContent=onlyAttention?'Требуют внимания сегодня':'Все карточки';
 const query=$('search').value.toLocaleLowerCase();const status=$('filter').value;
 const items=leads.filter(l=>(!onlyAttention||alerts[l.id])&&(!status||l.status===status)&&[l.name,l.telegram].join(' ').toLocaleLowerCase().includes(query));
 $('count').textContent=`Карточек: ${items.length}`;$('list').replaceChildren();
 for(const l of items){const row=button('',()=>detail(l.id),'lead-row'+(selected?.id===l.id?' selected':''));row.append(el('strong',l.name),el('span',l.status,'badge'),el('small',`${value(l.next_action)} · ${date(l.next_at)}`));if(alerts[l.id])row.append(el('small',alerts[l.id].map(x=>reasons[x]).join(' · '),'warning'));$('list').append(row);}
 if(!items.length)$('list').append(el('p','Карточек пока нет. Измените фильтр или добавьте лид.','muted'));
}
function fields(keys,initial={},required=true){$('fields').replaceChildren();for(const key of keys){const label=el('label',names[key]||key);const input=el('input');input.name=key;input.required=required||key==='name'||key==='result';input.maxLength=5000;
 if(key.endsWith('_at')){input.type='datetime-local';if(initial[key]){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(initial[key]));input.value=parts.replace(' ','T');}}
 else if(key.endsWith('_amount')||key==='probability'){input.type='number';input.min=key==='paid_amount'?'0.01':'0';input.step='0.01';if(key==='probability')input.max='100';input.value=initial[key]??'';}
 else input.value=initial[key]??'';label.append(input);$('fields').append(label);}}
function readFields(){const out={};for(const input of $('fields').querySelectorAll('input, select')){if(input.value==='')continue;out[input.name]=input.type==='number'?Number(input.value):input.type==='datetime-local'?input.value+':00+03:00':input.value;}return out;}
function modal(title,keys,initial,save,required=true){$('form-title').textContent=title;fields(keys,initial,required);$('form-error').textContent='';$('form').onsubmit=async e=>{e.preventDefault();const submit=$('form').querySelector('[type=submit]');submit.disabled=true;try{await save(readFields());$('modal').close();await refresh();}catch(err){$('form-error').textContent=err.message;}finally{submit.disabled=false;}};$('modal').showModal();}
async function act(body){return api(`/api/leads/${encodeURIComponent(selected.id)}/actions`,{version:selected.version,...body});}
function doneModal(l){
 const status=el('select');status.name='status';status.setAttribute('aria-label','Новый статус');
 for(const s of ['',...me.statuses.filter(s=>s!==l.status)]){const o=el('option',s||'Без изменения статуса');o.value=s;status.append(o);}
 const label=el('label','Новый статус (необязательно)');label.append(status);
 modal('Результат задачи',['result','next_action','next_at'],{},f=>{const {result,status,...rest}=f;return act({kind:'done',task_id:l.task_id,result,...(status?{status}:{}),fields:rest});},false);
 const draw=()=>{const previous=readFields();const required=requirements[status.value]||[];
  fields([...new Set(['result',...required,'next_action','next_at'])],{...previous,paid_amount:status.value==='Оплатил'?previous.paid_amount:undefined,payment_method:status.value==='Оплатил'?previous.payment_method:undefined},false);
  for(const input of $('fields').querySelectorAll('input'))if(required.includes(input.name))input.required=true;
  $('fields').prepend(label);
 };
 status.onchange=draw;$('fields').prepend(label);
}
function qualificationModal(){
 const status=el('select');status.name='status';status.required=true;status.setAttribute('aria-label','Результат созвона');
 for(const s of ['',...me.statuses.filter(s=>s!==selected.status)]){const o=el('option',s||'Выберите результат');o.value=s;status.append(o);}
 const label=el('label','Результат созвона');label.append(status);
 modal('Квалификация созвона',[],{},f=>{const {status,...rest}=f;return act({kind:'result',status,fields:rest});});
 status.onchange=()=>{fields(requirements[status.value]||[],{},true);$('fields').prepend(label);};
 $('fields').append(label);
}
function contactModal(){
 modal('Подтвердите фактический контакт',[],{},f=>act({kind:'contact',contact_type:f.contact_type}));
 const label=el('label','Тип состоявшегося контакта');const select=el('select');select.name='contact_type';select.required=true;
 for(const [v,t] of [['','Выберите тип'],['message','Сообщение'],['call','Звонок'],['meeting','Встреча']]){const o=el('option',t);o.value=v;select.append(o);}
 label.append(select);$('fields').append(label);
}
async function detail(id){
 selected=await api('/api/leads/'+encodeURIComponent(id));const l=selected;renderList();const box=$('detail');box.replaceChildren(el('span',l.status,'eyebrow'),el('h2',l.name));
 if(alerts[id])box.append(el('p',alerts[id].map(x=>reasons[x]).join(' · '),'warning'));
 const data=el('dl');for(const [title,v] of [['Telegram',l.telegram],['Ответственный',l.responsible],['Отрасль',l.industry],['Капитал',l.capital],['Запрос',l.request],['Касания',l.touch_count],['Следующий шаг',l.next_action],['Срок',date(l.next_at)],['Комментарий',l.comment],['Категория клиента',l.client_category],['Причина «Не ЦА»',l.not_target_reason],['Несоответствие категории',l.category_mismatch]])data.append(el('dt',title),el('dd',value(v)));box.append(data);
 for(const key of ['potential_amount','offer_amount','paid_amount'])if(l[key]!=null)box.append(el('p',`${names[key]}: ${l[key]}${l.unverified_amounts?.includes(key)?' — НЕ ПОДТВЕРЖДЕНО':''}`));
 if(l.undated_import)box.append(el('p','Импорт: история сохранена, недатированные события не участвуют в периодах. Суммы с пометкой требуют проверки.','muted'));
 if(me.role!=='producer'&&!(me.role==='lead_collector'&&l.handed_off)){
  const actions=el('div',null,'toolbar');
  if(me.role==='manager')for(const key of ['potential_amount','offer_amount'])if(l.unverified_amounts?.includes(key))actions.append(button('Проверить: '+names[key],()=>modal('Подтверждение суммы — укажите основание',[key,'comment'],{[key]:l[key]},f=>act({kind:'verify_amount',field:key,amount:f[key],comment:f.comment}))));
  actions.append(button('Редактировать',()=>modal('Данные клиента',me.role==='lead_collector'?['name','telegram','source','comment']:['name','telegram','source','industry','capital','request','comment'],l,f=>act({kind:'edit',fields:f}),false)));
  if(me.role!=='lead_collector'){
   actions.append(button('Взять в работу',async()=>{await act({kind:'take'});await refresh();}));
   const status=el('select');status.setAttribute('aria-label','Результат');me.statuses.forEach(s=>{const o=el('option',s);o.value=s;status.append(o);});status.value=l.status;actions.append(status,button('Зафиксировать результат',()=>modal(status.value,requirements[status.value]||[],status.value==='Оплатил'?{}:l,f=>act({kind:'result',status:status.value,fields:f})), 'btn primary'));
   for(const [type,label] of [['message','Сообщение'],['call','Звонок'],['meeting','Встреча']])actions.append(button('+ '+label,async()=>{await act({kind:'contact',contact_type:type});await refresh();}));
   if(l.task_id)actions.append(button('Сделано',()=>doneModal(l)));
   if(alerts[id]?.includes('offer_followup'))actions.append(button('Связаться по офферу',contactModal));
   if(alerts[id]?.includes('unqualified_call'))actions.append(button('Квалифицировать созвон',qualificationModal));
  }
  if(me.role==='manager'||me.role==='lead_collector'||(l.status==='Оплатил'&&!l.transferred_at)){
   const assign=el('select');assign.setAttribute('aria-label','Ответственный');const handoff=l.status==='Оплатил'&&!l.transferred_at;
   me.assignees.filter(x=>!handoff||x.role==='manager').forEach(x=>{const o=el('option',`${x.id} · ${x.role}`);o.value=x.id;assign.append(o);});
   actions.append(assign,button(handoff?'Передать руководителю':'Передать лид',async()=>{await act({kind:handoff?'handoff':'assign',responsible:Number(assign.value)});await refresh();}));
  }box.append(actions);
 }
 const history=el('details');history.append(el('summary','История изменений'));const events=await api(`/api/leads/${encodeURIComponent(id)}/events`);for(const e of events){const item=el('details');item.append(el('summary',`${date(e.at)} · ${value(e.actor)} · ${e.kind}`));const changes={};for(const [k,v] of Object.entries(e.new||{})){if(k==='import_raw')continue;if(JSON.stringify(v)!==JSON.stringify(e.old?.[k]))changes[k]={было:e.old?.[k]??null,стало:v};}item.append(el('pre',JSON.stringify(changes,null,2)));history.append(item);}box.append(history);
 if(l.import_raw){const raw=el('details');raw.append(el('summary','Оригинал импорта и исходная история'),el('pre',JSON.stringify(l.import_raw,null,2)));box.append(raw);}
}
const conversionNames={lead_to_work:'Новый лид → В работе',work_to_scheduled:'В работе → Назначен созвон',completed_to_potential:'Созвон проведён → Потенциал',completed_to_not_target:'Созвон проведён → Не ЦА',completed_to_refusal:'Созвон проведён → Отказ',offer_to_paid:'Оффер → Оплатил',lead_to_call:'Новый лид → Назначен созвон'};
async function report(){
 const box=$('report');box.hidden=false;box.classList.add('monitor');
 const header=el('header',null,'monitor-header');const title=el('div');title.append(el('span','АНАЛИТИКА ПО СОБЫТИЯМ','monitor-kicker'),el('h2','Монитор продаж'),el('p','Подтверждённые результаты. Текущая воронка.','monitor-note'));
 const controls=el('div',null,'monitor-controls');
 const period=el('select');period.id='report-period';period.setAttribute('aria-label','Период аналитики');
 [['today','Сегодня'],['week','Неделя'],['month','Месяц'],['all','Всё время']].forEach(([v,t])=>{const o=el('option',t);o.value=v;period.append(o);});
 const seller=el('select');seller.id='report-seller';seller.setAttribute('aria-label','Ответственный в аналитике');const all=el('option','Все продавцы');all.value='';seller.append(all);
 me.assignees.forEach(x=>{const o=el('option',String(x.id));o.value=x.id;seller.append(o);});
 const pl=el('label','Период');pl.append(period);const sl=el('label','Ответственный');sl.append(seller);if(me.role==='sales_manager')sl.hidden=true;
 controls.append(pl,sl);header.append(title,controls);
 const state=el('p','Загрузка показателей…','monitor-load-state');state.id='dashboard-state';state.setAttribute('role','status');
 const output=el('div');output.id='dashboard-output';box.replaceChildren(header,state,output);
 let generation=0;
 const load=async()=>{
  const current=++generation;state.hidden=false;state.textContent='Загрузка показателей…';output.setAttribute('aria-busy','true');output.hidden=true;
  const sellerId=me.role==='sales_manager'?me.id:(seller.value?Number(seller.value):null);
  try{
   const a=await api(`/api/analytics?period=${period.value}${seller.value?'&seller='+encodeURIComponent(seller.value):''}`);
   if(current!==generation)return;
   renderDashboard(output,a,leads.filter(l=>sellerId===null||Number(l.responsible)===Number(sellerId)),me.statuses);
   output.hidden=false;state.hidden=true;
  }catch(e){if(current===generation){state.textContent='Показатели недоступны. Нажмите «Обновить», чтобы повторить.';output.replaceChildren();}throw e;}
  finally{if(current===generation)output.setAttribute('aria-busy','false');}
 };
 reloadReport=load;period.onchange=()=>load().catch(showError);seller.onchange=()=>load().catch(showError);await load();
}
async function boot(){
 if(/^https:\/\/t\.me\/[A-Za-z0-9_]+/.test(cfg.BOT_URL||'')){$('telegram-link').href=cfg.BOT_URL;$('telegram-link').hidden=false;$('setup').textContent='Доступ выдаёт руководитель команды.';}
 if(!initData)return;
 if(!/^https:\/\//.test(API_BASE))throw Error('Администратор ещё не настроил HTTPS API.');
 tg.ready();tg.expand();me=await api('/api/me');$('role').textContent=(roleNames[me.role]||'Нет доступа')+' · ID '+me.id;$('login').hidden=true;$('workspace').hidden=false;$('add').hidden=me.role==='producer';$('analytics').hidden=me.role==='lead_collector';
 me.statuses.forEach(s=>{const o=el('option',s);o.value=s;$('filter').append(o);});await refresh();const deep=new URLSearchParams(location.search).get('lead');if(deep)await detail(deep);else if(me.role==='manager'){selectNavigation('analytics');await report();}
}
$('cancel').onclick=()=>$('modal').close();$('search').oninput=renderList;$('filter').onchange=renderList;
$('add').onclick=()=>modal('Новый лид',['name','telegram','source','comment'],{},f=>api('/api/leads',f),false);
$('all').onclick=()=>showList(false);$('attention').onclick=()=>showList(true);$('reload').onclick=visibleRefresh;$('analytics').onclick=()=>{selectNavigation('analytics');report().catch(showError);};
selectNavigation('all');
boot().catch(showError);
