/** Format a station-local calendar date without changing its timezone. */
export function displayLocalDate(value:string):string{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 return match?Number(match[3])+'. '+Number(match[2])+'. '+match[1]:value;
}
export function displayMonthDay(value:string):string{
 const match=/^(\d{2})-(\d{2})$/.exec(value);
 return match?Number(match[2])+'. '+Number(match[1])+'.':value;
}
