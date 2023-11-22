import moment from "moment";
import debug from "debug";

const logger = debug('redbook-processor');


type RiskDataAndFieldValues = {
    date: number,
    values: string[]
}

export enum RiskResultSeverity {
    normal,
    severe
}

export type RiskResult = {
    name: string,
    message: string,
    severity: RiskResultSeverity,
    actions?:string[]
}

export class RedBookProcessor {
    private static _instance: RedBookProcessor;

    private constructor() {
    }

    public static getInstance(): RedBookProcessor {
        if (!RedBookProcessor._instance) {
            RedBookProcessor._instance = new RedBookProcessor();
        }
        return RedBookProcessor._instance;
    }



    protected getDateAndFieldValuesForEntry(values: RiskDataAndFieldValues[], dateFieldName: string, valuesEntry: any, fields: any[]) {
        let dateAndFieldsValues: RiskDataAndFieldValues = {
            date: -1,
            values: []
        };

        const dateValue = valuesEntry[dateFieldName];
        if (dateValue) {
            dateAndFieldsValues.date = parseInt(dateValue);
            let foundAllFields = true;
            fields.forEach((fieldName: any, index: number) => {
                const fieldValue = valuesEntry[fieldName];
                if (fieldValue) {
                    dateAndFieldsValues.values.push(fieldValue + "");
                } else {
                    foundAllFields = false;
                }
            });

            if (foundAllFields) {
                values.push(dateAndFieldsValues);
            }
        }
    }

    protected getFieldValuesAndDates(patient: any, sectionFieldName: string, fields: any[]): RiskDataAndFieldValues[] {
        const values: RiskDataAndFieldValues[] = [];
        // date field is the first field
        const dateFieldName = fields[0];
        const isSectionArray = (sectionFieldName.indexOf('[]') > 0);

        if (isSectionArray) {
            const sectionArrayFieldName = sectionFieldName.substr(0, sectionFieldName.length - 2);
            const sectionValuesArray = patient[sectionArrayFieldName];
            if (sectionValuesArray) {
                sectionValuesArray.forEach((valuesEntry: any) => {
                    this.getDateAndFieldValuesForEntry(values, dateFieldName, valuesEntry, fields);

                })
            }
        } else {
            const sectionArrayFieldName = sectionFieldName;
            const sectionValues = patient[sectionArrayFieldName];
            if (sectionValues) {
                const valuesEntry = sectionValues;
                this.getDateAndFieldValuesForEntry(values, dateFieldName, valuesEntry, fields);
            }
        }

        return values;
    }

    protected getFieldValue(data: any, dataFieldPath: string, isArray: boolean): any[] {
        let result: any[] = [];
        if (data) {
            const fields = dataFieldPath.split('.');
            let subField = fields[0];

            if (fields.length > 1) {

                const isSubFieldArray = (subField.indexOf('[]') > 0);
                if (isSubFieldArray) {
                    subField = subField.substr(0, subField.length - 2);
                }

                fields.splice(0, 1);
                const subDataFieldPath = fields.join('.');

                const subData = data[subField];

                const subResults = this.getFieldValue(subData, subDataFieldPath, isSubFieldArray);
                subResults.forEach((subResult) => {
                    result.push(subResult);
                })
            } else {
                if (isArray) {
                    data.forEach((item: any) => {
                        const value = item[subField];
                        if (value) {
                            result.push(value);
                        }
                    })
                } else {
                    const value = data[subField];
                    if (value) {
                        result.push(value);
                    }
                }
            }
        }
        return result;
    }

    protected isTestValueInAnyOf(value: any, testValues: string): boolean {
        let result = false;
        const testValueItems = testValues.split(',');
        testValueItems.forEach((testValue) => {
            const lowerCaseValue = (value + '').toLowerCase();
            if (lowerCaseValue.includes(testValue)) {
                result = true;
            }
        })

        return result;
    }

    protected doesPatientMeetCriterion(patient: any, criterion: any): boolean {
        let result = false;
        if (criterion) {
            if (criterion.ageRange) {
                const lowerAge = criterion.ageRange[0];
                const upperAge = criterion.ageRange[1];
                // calculate the patients age
                if (patient) {
                    if (patient.demographics) {
                        if (patient.demographics.dob) {
                            const age = moment().diff(moment(patient.demographics.dob, 'YYYYMMDD'), 'years');
                            if (age >= lowerAge && age <= upperAge) {
                                result = true;
                            }
                        }
                    }
                }
            }
            if (criterion.field && criterion.value && criterion.comparison) {
                // get the values for the comparison
                const values = this.getFieldValue(patient, criterion.field, false);
                if (values.length > 0) {
                    switch (criterion.comparison) {
                        case 'eq': {
                            const value = values[0];
                            result = (value === criterion.value);
                            break;
                        }
                        case 'gte': {
                            const value = values[0];
                            result = (value >= criterion.value);
                            break;
                        }
                        case 'gt': {
                            const value = values[0];
                            result = (value > criterion.value);
                            break;
                        }
                        case 'lt': {
                            const value = values[0];
                            result = (value < criterion.value);
                            break;
                        }
                        case 'lte': {
                            const value = values[0];
                            result = (value <= criterion.value);
                            break;
                        }
                        case 'neq': {
                            const value = values[0];
                            result = (value !== criterion.value);
                            break;
                        }
                        case 'includesAnyOf': {
                            values.forEach((value) => {
                                if (this.isTestValueInAnyOf(value, criterion.value)) {
                                    result = true;
                                }
                            })
                        }

                    }
                }


            }
        }

        return result;
    }

    protected doesPatientMeetCriteria(patient: any, criteria: any): boolean {
        let result = false;

        if (patient) {
            if (criteria) {
                let criterionMatchesCount = 0;
                criteria.forEach((criterion: any) => {
                    if (this.doesPatientMeetCriterion(patient, criterion)) {
                        criterionMatchesCount++;
                    }
                });

                result = (criterionMatchesCount === criteria.length);
            }
        }

        return result;
    }

    protected hasBeenDoneInRequiredInterval(dateAndFieldEntries: RiskDataAndFieldValues[], whenShouldHaveBeenDoneLast: number): boolean {
        let result = false;
        dateAndFieldEntries.forEach((dateAndFieldEntry) => {
            if (dateAndFieldEntry.date >= whenShouldHaveBeenDoneLast) {
                result = true;
            }
        })

        return result;
    }

    protected processRisk(patient: any, risk: any, results:RiskResult[]): void {
        const measure = risk.measure;
        const riskGroups = measure.riskGroups;
        const fields = measure.fields;
        const sectionFieldName = risk.section;

        // does the patient meet the criteria?
        if (riskGroups) {
            const sortedRiskGroups = riskGroups.sort((a:any,b:any) => {
                let result = 0;
                if (a) {
                    if (b) {
                        if (a.severity) {
                            if (b.severity) {
                                if (a.severity > b.severity) {
                                    result = -1;
                                }
                                else {
                                    result = 1;
                                }
                            }
                        }
                    }
                }
                return result;
            });
            console.log('risk groups sorted');
            let hasBeenProcessed = false;
            sortedRiskGroups.forEach((riskGroup:any) => {
                if (!hasBeenProcessed) {
                    if (this.doesPatientMeetCriteria(patient, riskGroup.criteria)) {
                        hasBeenProcessed = true;

                        // calculate the frequency value date
                        const dateAndFieldEntries = this.getFieldValuesAndDates(patient, sectionFieldName, fields);
                        const whenShouldHaveBeenDoneLast = parseInt(moment().subtract(riskGroup.frequency.value, riskGroup.frequency.unit).format('YYYYMMDD'));
                        if (!this.hasBeenDoneInRequiredInterval(dateAndFieldEntries, whenShouldHaveBeenDoneLast)) {
                            results.push({
                                message: riskGroup.message, name: risk.name, severity: RiskResultSeverity.normal, actions: riskGroup.actions
                            })

                        }
                    }
                }


            });
        }
    }

    public processPatient(redbook: any, patient: any): RiskResult[] {
        const results:RiskResult[] = [];
        if (redbook.risks) {
            redbook.risks.forEach((risk:any) => {
                this.processRisk(patient, risk, results);
            })
        }
        return results;

    }


}
