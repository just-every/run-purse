// The browser test harness substitutes this transport; deployed Workers always use fetch.
export const fetchScreeningSource: typeof fetch = (input, init) => fetch(input, init);
