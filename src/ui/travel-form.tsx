import { TooltipButton } from './tooltip-button';
import { useState } from 'react';
import { travelPerDiem } from '../purse/travel-rates';
import { Form, Field, amountText, Details, money, type D } from './shared';

const categories = [['airfare', 'Airfare'], ['lodging', 'Lodging'], ['groundTransport', 'Ground transport'], ['registration', 'Registration fees'], ['other', 'Other']] as const;
export function TravelRequestForm({ data, actor, mutate, current }: { data: D; actor: D; mutate: (op: string, input: D) => Promise<any>; current?: D }) {
    const trip = current?.travel, business = data.business[0];
    const [destinations, setDestinations] = useState<D[]>(trip?.destinations ?? [{ city: '', state: '', country: 'US' }]);
    const [departureDate, setDeparture] = useState(trip?.departureDate ?? ''), [returnDate, setReturn] = useState(trip?.returnDate ?? '');
    const [currency, setCurrency] = useState(current?.currency ?? 'USD');
    let perDiem: D | undefined;
    try { if (destinations.length === 1 && departureDate && returnDate) perDiem = travelPerDiem(destinations[0], departureDate, returnDate); } catch { /* The form and server show the date validation on save. */ }
    if (!business) return <p>Configure the workspace before requesting travel.</p>;
    const choices = (name: string) => business[name].map((value: string) => ({ value, label: value }));
    const cost = (category: string) => amountText(trip?.costs[category + 'Minor'] ?? 0);
    return <Form label={current ? 'Save travel amendment' : 'Save travel draft'} tooltip={current ? 'Travel amendment' : 'Travel draft'} initial={{ id: current?.id, revision: current?.revision }} onSubmit={input => {
        const costs: D = Object.fromEntries(categories.map(([category]) => [category + 'Amount', input[category + 'Amount']]));
        if (String(input.mealsIncidentalsAmount).trim()) costs.mealsIncidentalsAmount = input.mealsIncidentalsAmount;
        return mutate(current ? 'travel-amend' : 'travel-request', { ...input, currency, project: input.project, travel: { traveler: input.traveler, travelerEmail: input.travelerEmail, purpose: input.purpose, origin: input.origin, destinations, departureDate, returnDate, costs } });
    }}>
        <Field label="Travel request title" name="title" defaultValue={current?.title}/>
        <Field label="Traveler" name="traveler" defaultValue={trip?.traveler ?? actor.email}/>
        <Field label="Traveler email" name="travelerEmail" type="email" defaultValue={trip?.travelerEmail ?? actor.email}/>
        <Field label="Trip purpose" name="purpose" type="textarea" defaultValue={trip?.purpose}/>
        <Field label="Trip origin" name="origin" defaultValue={trip?.origin}/>
        <fieldset className="wide"><legend>Destinations</legend>{destinations.map((destination, index) => <div key={index} className="line">{[['city', 'City'], ['state', 'State or province'], ['county', 'County (optional)'], ['country', 'Country code']].map(([key, label]) => <label key={key}>{label}<input aria-label={`Destination ${index + 1} ${label.toLowerCase()}`} required={!['state','county'].includes(key)} value={destination[key] ?? ''} onChange={event => setDestinations(destinations.map((value, position) => position === index ? { ...value, [key]: event.target.value } : value))}/></label>)}<label><input type="checkbox" aria-label={`Destination ${index + 1} uses published standard CONUS rate`} checked={Boolean(destination.standardConus)} onChange={event => setDestinations(destinations.map((value, position) => position === index ? { ...value, standardConus: event.target.checked } : value))}/> I confirm this destination uses the published standard CONUS rate.</label>{destinations.length > 1 && <TooltipButton type="button" label="Remove destination" aria-label={`Remove destination ${index + 1}`} onClick={() => setDestinations(destinations.filter((_, position) => position !== index))}>Remove destination {index + 1}</TooltipButton>}</div>)}<TooltipButton type="button" label="Add destination" onClick={() => setDestinations([...destinations, { city: '', state: '', country: 'US' }])}>Add destination</TooltipButton></fieldset>
        <label className="field">Departure date<input aria-label="Departure date" type="date" required value={departureDate} onChange={event => setDeparture(event.target.value)}/></label>
        <label className="field">Return date<input aria-label="Return date" type="date" required value={returnDate} onChange={event => setReturn(event.target.value)}/></label>
        <label className="field">Travel currency<select aria-label="Travel currency" required value={currency} onChange={event => setCurrency(event.target.value)}>{choices('currencies').map((choice: D) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
        <Field label="Travel location" name="location" options={choices('locations')} defaultValue={current?.location}/>
        <Field label="Travel department" name="costCentre" options={choices('costCentres')} defaultValue={current?.costCentre}/>
        <Field label="Travel project" name="project" options={choices('projects')} defaultValue={current?.project ?? current?.lines[0]?.project}/>
        {categories.map(([category, label]) => <Field key={category} label={`${label} estimate`} name={category + 'Amount'} defaultValue={cost(category)}/>)}
        <Field label="Meals and incidentals estimate (blank uses GSA)" name="mealsIncidentalsAmount" required={false} defaultValue={trip?.mealsBasis === 'explicit-estimate' ? cost('mealsIncidentals') : ''}/>
        {perDiem?.available && currency === 'USD' ? <p className="wide">GSA default: {money(perDiem.amountMinor, 'USD')} for {perDiem.days} calendar days in {perDiem.destination}. Full day {money(perDiem.dailyMinor, 'USD')}; first and last days {money(perDiem.boundaryMinor, 'USD')}. <a href={perDiem.source} target="_blank" rel="noreferrer">Published GSA rates</a>. Leave the meals estimate blank to use this default.</p> : <p className="quiet wide">Enter an explicit meals and incidentals estimate when no single destination GSA rate is available, or when using another currency.</p>}
        {current && <Field label="Travel amendment reason" name="reason"/>}
        <p className="quiet wide">Save the draft, review the trip and submit for approval. Approval gives you a reference for your booking tool.</p>
    </Form>;
}
export function TravelNewRequest(props: { data: D; actor: D; mutate: (op: string, input: D) => Promise<any> }) {
    return <Details label="Request travel pre-approval"><TravelRequestForm {...props}/></Details>;
}
