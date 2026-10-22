import {useState} from 'react';
import {type D} from './shared';
export const correctionNames:D={glAccount:'GL account',costCentre:'Department',location:'Location',class:'Class',project:'Project',needDate:'Need date',shipTo:'Ship to',supplier:'Supplier',notes:'Notes to supplier'};
const defaultMaterial=['glAccount','costCentre','project','supplier'];
export function policyEditRules(input:D,previous?:D) {
 const kind=input.editPurchaseType;
 return {...previous,[kind]:{allowed:Object.keys(correctionNames).filter(field=>input['allow:'+field]==='on'),material:Object.keys(correctionNames).filter(field=>input['material:'+field]==='on')}};
}
export function ApproverEditRules({policy}:{policy?:D}) {
 const [kind,setKind]=useState('*'),rule=policy?.editRules?.[kind]??{allowed:[],material:defaultMaterial};
 return <><label>Approver editing purchase type<select name="editPurchaseType" value={kind} onChange={event=>setKind(event.target.value)}>{['*','goods','software','services','contractors','equipment'].map(value=><option key={value} value={value}>{value==='*'?'All purchase types':value}</option>)}</select></label><fieldset className="wide" key={kind}><legend>Allowed approver corrections</legend><p>These permissions apply to the header and existing line coding. Quantities, prices and adding or removing lines require a return or amendment.</p>{Object.entries(correctionNames).map(([field,label])=><label key={field}><input type="checkbox" name={'allow:'+field} defaultChecked={rule.allowed.includes(field)}/>{label}</label>)}</fieldset><fieldset className="wide" key={'material-'+kind}><legend>Material approver corrections</legend><p>Material corrections ask affected earlier approvers again. Department and route changes also re-evaluate budget authority.</p>{Object.entries(correctionNames).map(([field,label])=><label key={field}><input type="checkbox" name={'material:'+field} defaultChecked={rule.material.includes(field)}/>{label} is material</label>)}</fieldset></>;
}
