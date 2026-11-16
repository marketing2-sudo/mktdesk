import React,{useState,useEffect,useRef} from 'react';
import {Paperclip, X, Download, Eye} from 'lucide-react';
import {supabase} from './supabase';
const BUCKET='bd-references';
const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};
function validate(files){
 if(files.length>5) throw new Error('Selecione no máximo cinco referências por envio.');
 for(const f of files){if(!types[f.type] || f.size<=0 || f.size>10*1024*1024)throw new Error(`Arquivo inválido: ${f.name}. Use JPG, PNG, WEBP ou PDF de até 10 MB.`);}
}
export async function uploadReferences(ticketId,userId,internal,files){
 validate(files);const out=[];
 for(const f of files){const path=`${ticketId}/${internal?'private':'public'}/${userId}/${crypto.randomUUID()}.${types[f.type]}`;
 const {error}=await supabase.storage.from(BUCKET).upload(path,f,{contentType:f.type,upsert:false});if(error)throw error;
 out.push({path,name:f.name.slice(0,180),mime:f.type,size:f.size});}
 return out;
}
export function ReferencePicker({files,onChange,disabled,label}){
 const [error,setError]=useState('');const input=useRef(null);
 function append(list){try{const next=[...files,...list];validate(next);onChange(next);setError('');}catch(e){setError(e.message);}}
 useEffect(()=>{try{validate(files);setError('');}catch(e){setError(e.message);}},[files]);
 return <div className="space-y-1 text-xs" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!disabled)append(Array.from(e.dataTransfer.files));}}>
 <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={disabled} onChange={e=>{append(Array.from(e.target.files));e.target.value='';}}/>
 <button type="button" disabled={disabled} onClick={()=>input.current?.click()} className="w-full border border-dashed border-slate-300 rounded-xl px-3 py-2 flex items-center gap-2 text-indigo-700" ><Paperclip className="w-4 h-4"/>{label}</button>
 <p className="text-slate-500">JPG, PNG, WEBP ou PDF · até 5 arquivos de 10 MB. Arraste aqui ou cole um print no texto.</p>
 {files.map((f,i)=><div key={i} className="flex items-center gap-2 bg-slate-100 rounded-lg p-1.5"><span className="flex-1 truncate">{f.name} ({Math.ceil(f.size/1024)} KB)</span><button type="button" disabled={disabled} aria-label={`Remover ${f.name}`} onClick={()=>onChange(files.filter((_,j)=>i!==j))}><X className="w-4 h-4"/></button></div>)}
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 </div>;
}
function ReferenceFile({file}){
 const [preview,setPreview]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const urlRef=useRef(null);
 useEffect(()=>()=>{if(urlRef.current)URL.revokeObjectURL(urlRef.current);},[]);
 async function get(show){setBusy(true);setError('');try{const {data,error}=await supabase.storage.from(BUCKET).download(file.path);if(error)throw error;
 const url=URL.createObjectURL(data);if(show){if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=url;setPreview(url);}else{const a=document.createElement('a');a.href=url;a.download=file.name||'referencia';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}}catch(e){setError(e.message||'Não foi possível abrir o arquivo.');}finally{setBusy(false);}}
 return <div className="rounded-lg border border-slate-200 p-2 space-y-1"><div className="flex flex-wrap items-center gap-2 text-xs"><Paperclip className="w-4 h-4"/><span className="flex-1 break-all">{file.name}</span>{['image/jpeg','image/png','image/webp'].includes(file.mime)&&<button type="button" disabled={busy} onClick={()=>preview?setPreview(null):get(true)} className="text-indigo-700 underline inline-flex gap-1"><Eye className="w-4 h-4"/>{preview?'Fechar':'Visualizar'}</button>}<button type="button" disabled={busy} onClick={()=>get(false)} className="text-indigo-700 underline inline-flex gap-1"><Download className="w-4 h-4"/>Baixar</button></div>{preview&&<img src={preview} alt={file.name} className="w-full max-h-[65vh] object-contain rounded-lg"/>}{busy&&<p className="text-xs">Carregando...</p>}{error&&<p role="alert" className="text-red-700 text-xs">{error}</p>}</div>;
}
export function ReferenceFiles({files}){return Array.isArray(files)&&files.length>0?<div className="space-y-2 mt-2">{files.map((f,i)=><ReferenceFile key={f.path||i} file={f}/>)}</div>:null;}
