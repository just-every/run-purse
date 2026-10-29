export const invoiceChargeTypes = [
    {type:'freight', field:'freightAmount', label:'Freight'},
    {type:'fuel', field:'fuelAmount', label:'Fuel surcharge'},
    {type:'handling', field:'handlingAmount', label:'Handling'},
    {type:'small-order', field:'smallOrderAmount', label:'Small-order fee'},
    {type:'other', field:'otherChargeAmount', label:'Other fees'},
] as const;
