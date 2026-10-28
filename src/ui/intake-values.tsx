import { type D } from './shared';
export function IntakeValues({form,values}:{form?:D;values:D}) {
    form = values.intakeFormSnapshot ?? form;
    if (!values.intakeForm && !values.lines?.some((line:D)=>line.allocations?.length)) return null;
    return <section className="wide" aria-label="Category answers"><h4>{form?.name ?? values.intakeFormSnapshot?.name ?? 'Category answers'}</h4>
        {Object.entries({...values.answers,...values.customFields}).map(([key,value])=><p key={key}>{[...form?.questions??[],...form?.headerFields??[]].find(f=>f.id===key)?.label??key}: {String(value)}</p>)}
        {values.lines?.map((line:D,index:number)=><div key={index}>{Object.entries(line.customFields??{}).map(([key,value])=><p key={key}>{line.description} · {form?.lineFields?.find((field:D)=>field.id===key)?.label??key}: {String(value)}</p>)}{line.allocations?.map((split:D,i:number)=><p key={i}>{line.description} · {split.costCentre} / {split.project}: {split.basisPoints/100}%</p>)}</div>)}
    </section>;
}
