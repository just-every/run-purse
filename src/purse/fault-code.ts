// Native HTTP and company tools expose the same stable business-refusal codes.
export function nativeFaultCode(status:number):string {
  return status===409?'native_conflict':status===403?'permission_denied':status===404?'not_found':'invalid_arguments'
}
