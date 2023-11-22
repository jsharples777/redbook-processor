declare type RiskDataAndFieldValues = {
    date: number;
    values: string[];
};
export declare enum RiskResultSeverity {
    normal = 0,
    severe = 1
}
export declare type RiskResult = {
    name: string;
    message: string;
    severity: RiskResultSeverity;
    actions?: string[];
};
export declare class RedBookProcessor {
    private static _instance;
    private constructor();
    static getInstance(): RedBookProcessor;
    protected getDateAndFieldValuesForEntry(values: RiskDataAndFieldValues[], dateFieldName: string, valuesEntry: any, fields: any[]): void;
    protected getFieldValuesAndDates(patient: any, sectionFieldName: string, fields: any[]): RiskDataAndFieldValues[];
    protected getFieldValue(data: any, dataFieldPath: string, isArray: boolean): any[];
    protected isTestValueInAnyOf(value: any, testValues: string): boolean;
    protected doesPatientMeetCriterion(patient: any, criterion: any): boolean;
    protected doesPatientMeetCriteria(patient: any, criteria: any): boolean;
    protected hasBeenDoneInRequiredInterval(dateAndFieldEntries: RiskDataAndFieldValues[], whenShouldHaveBeenDoneLast: number): boolean;
    protected processRisk(patient: any, risk: any, results: RiskResult[]): void;
    processPatient(redbook: any, patient: any): RiskResult[];
}
export {};
