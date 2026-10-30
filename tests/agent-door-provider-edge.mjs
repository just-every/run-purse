// Only the public CSL download reaches this isolated, credential-free test edge.
// The production parser and screening decisions run unchanged inside Purse.
export default {async fetch(request){
 const url=new URL(request.url)
 if(request.method!=='GET'||url.href!=='https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.csv')return new Response('Unrecognized CSL request',{status:400})
 return new Response('source,entity_number,name,alt_names,addresses,programs,source_list_url\n"Specially Designated Nationals (SDN) - Treasury Department",901,"Restricted Test Trading","Blocked Alias Test","123 Test Street, Denver, CO 80202, United States",TEST,https://sanctionslist.ofac.treas.gov/Home/SdnList\n', {headers:{'content-type':'text/csv','last-modified':new Date().toUTCString()}})
}}
