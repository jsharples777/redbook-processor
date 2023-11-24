"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedBookProcessor = exports.RiskResultSeverity = void 0;
const moment_1 = __importDefault(require("moment"));
const debug_1 = __importDefault(require("debug"));
const logger = debug_1.default('redbook-processor');
const dlogger = debug_1.default('redbook-processor-detail');
const dlogger2 = debug_1.default('redbook-processor-detail-2');
var RiskResultSeverity;
(function (RiskResultSeverity) {
    RiskResultSeverity[RiskResultSeverity["normal"] = 0] = "normal";
    RiskResultSeverity[RiskResultSeverity["severe"] = 1] = "severe";
})(RiskResultSeverity = exports.RiskResultSeverity || (exports.RiskResultSeverity = {}));
class RedBookProcessor {
    constructor() {
    }
    static getInstance() {
        if (!RedBookProcessor._instance) {
            RedBookProcessor._instance = new RedBookProcessor();
        }
        return RedBookProcessor._instance;
    }
    getDateAndFieldValuesForEntry(values, dateFieldName, valuesEntry, fields) {
        let dateAndFieldsValues = {
            date: -1,
            values: []
        };
        const dateValue = valuesEntry[dateFieldName];
        if (dateValue) {
            dateAndFieldsValues.date = parseInt(dateValue);
            let foundAllFields = true;
            fields.forEach((fieldName, index) => {
                const fieldValue = valuesEntry[fieldName];
                if (fieldValue) {
                    dateAndFieldsValues.values.push(fieldValue + "");
                }
                else {
                    foundAllFields = false;
                }
            });
            if (foundAllFields) {
                values.push(dateAndFieldsValues);
            }
        }
    }
    getFieldValuesAndDates(patient, sectionFieldName, fields) {
        const values = [];
        // date field is the first field
        const dateFieldName = fields[0];
        const isSectionArray = (sectionFieldName.indexOf('[]') > 0);
        if (isSectionArray) {
            const sectionArrayFieldName = sectionFieldName.substr(0, sectionFieldName.length - 2);
            const sectionValuesArray = patient[sectionArrayFieldName];
            if (sectionValuesArray) {
                sectionValuesArray.forEach((valuesEntry) => {
                    this.getDateAndFieldValuesForEntry(values, dateFieldName, valuesEntry, fields);
                });
            }
        }
        else {
            const sectionArrayFieldName = sectionFieldName;
            const sectionValues = patient[sectionArrayFieldName];
            if (sectionValues) {
                const valuesEntry = sectionValues;
                this.getDateAndFieldValuesForEntry(values, dateFieldName, valuesEntry, fields);
            }
        }
        return values;
    }
    getFieldValue(data, dataFieldPath, isArray) {
        let result = [];
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
                });
            }
            else {
                if (isArray) {
                    data.forEach((item) => {
                        const value = item[subField];
                        if (value) {
                            result.push(value);
                        }
                    });
                }
                else {
                    const value = data[subField];
                    if (value) {
                        result.push(value);
                    }
                }
            }
        }
        return result;
    }
    isTestValueInAnyOf(value, testValues) {
        let result = false;
        const testValueItems = testValues.split(',');
        testValueItems.forEach((testValue) => {
            const lowerCaseValue = (value + '').toLowerCase();
            if (lowerCaseValue.includes(testValue)) {
                result = true;
            }
        });
        return result;
    }
    doesPatientMeetCriterion(patient, criterion) {
        let result = false;
        if (criterion) {
            if (criterion.ageRange) {
                const lowerAge = criterion.ageRange[0];
                const upperAge = criterion.ageRange[1];
                // calculate the patients age
                if (patient) {
                    if (patient.demographics) {
                        if (patient.demographics.dob) {
                            const age = moment_1.default().diff(moment_1.default(patient.demographics.dob, 'YYYYMMDD'), 'years');
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
                            });
                        }
                    }
                }
            }
        }
        return result;
    }
    doesPatientMeetCriteria(patient, criteria) {
        let result = false;
        if (patient) {
            if (criteria) {
                let criterionMatchesCount = 0;
                criteria.forEach((criterion) => {
                    if (this.doesPatientMeetCriterion(patient, criterion)) {
                        criterionMatchesCount++;
                    }
                });
                result = (criterionMatchesCount === criteria.length);
            }
        }
        return result;
    }
    doesFieldMatchFieldCriterion(fields, dateAndFieldEntry, matchTest) {
        let result = false;
        dlogger2(`Checking field criterion for field ${matchTest.field} with match ${matchTest.comparison} for value ${matchTest.value}`);
        const fieldIndex = fields.findIndex((field) => field === matchTest.field);
        if (fieldIndex >= 1) {
            let fieldValue = dateAndFieldEntry.values[fieldIndex];
            if (fieldValue) {
                fieldValue = fieldValue.toLowerCase().trim();
                let matchValue = matchTest.value;
                matchValue = matchValue.toLowerCase().trim();
                dlogger2(`Match value is '${matchValue}', field value is '${fieldValue}'`);
                switch (matchTest.comparison) {
                    case "contains": {
                        dlogger2(`contains index ${fieldValue.indexOf(matchValue)}`);
                        if (fieldValue.indexOf(matchValue) >= 0) {
                            result = true;
                        }
                        break;
                    }
                    case 'eq': {
                        result = (fieldValue === matchValue);
                        break;
                    }
                    case 'gte': {
                        result = (fieldValue >= matchValue);
                        break;
                    }
                    case 'gt': {
                        result = (fieldValue > matchValue);
                        break;
                    }
                    case 'lt': {
                        result = (fieldValue < matchValue);
                        break;
                    }
                    case 'lte': {
                        result = (fieldValue <= matchValue);
                        break;
                    }
                    case 'neq': {
                        result = (fieldValue !== matchValue);
                        break;
                    }
                }
                dlogger2(`Checking field criterion for field ${matchTest.field} with match ${matchTest.comparison} for value ${matchTest.value} - ${result}`);
            }
            else {
                dlogger2(`Cannot find field  value for ${matchTest.field} in fields ${dateAndFieldEntry.values}`);
            }
        }
        else {
            dlogger2(`Cannot find match field ${matchTest.field} in fields ${fields}`);
        }
        return result;
    }
    doesFieldMatchFieldMatchCriteria(fields, entry, fieldMatch) {
        let result = true;
        if (fieldMatch) {
            dlogger2(`field criteria present`);
            fieldMatch.forEach((match) => {
                if (!this.doesFieldMatchFieldCriterion(fields, entry, match)) {
                    result = false;
                }
            });
        }
        return result;
    }
    hasBeenDoneInRequiredInterval(fields, dateAndFieldEntries, whenShouldHaveBeenDoneLast, fieldMatch) {
        let result = false;
        dlogger2(fields);
        dlogger2(dateAndFieldEntries);
        dlogger2(fieldMatch);
        dlogger2(`Should have been last done ${whenShouldHaveBeenDoneLast}`);
        dateAndFieldEntries.forEach((entry) => {
            if (entry.date >= whenShouldHaveBeenDoneLast) {
                if (this.doesFieldMatchFieldMatchCriteria(fields, entry, fieldMatch)) {
                    result = true;
                }
            }
        });
        return result;
    }
    processRisk(patient, risk, results) {
        const measure = risk.measure;
        const riskGroups = measure.riskGroups;
        const fields = measure.fields;
        const sectionFieldName = risk.section;
        const fieldMatch = measure.fieldMatch;
        // does the patient meet the criteria?
        if (riskGroups) {
            const sortedRiskGroups = riskGroups.sort((a, b) => {
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
            let hasBeenProcessed = false;
            sortedRiskGroups.forEach((riskGroup) => {
                if (!hasBeenProcessed) {
                    dlogger(`Processing patient ${patient._id} for risk ${risk.name} for riskgroup ${riskGroup.severity}`);
                    if (this.doesPatientMeetCriteria(patient, riskGroup.criteria)) {
                        dlogger(`Processing patient ${patient._id} for risk ${risk.name} for riskgroup ${riskGroup.severity} - patient matched criteria, getting field values`);
                        hasBeenProcessed = true;
                        // calculate the frequency value date
                        const dateAndFieldEntries = this.getFieldValuesAndDates(patient, sectionFieldName, fields);
                        const whenShouldHaveBeenDoneLast = parseInt(moment_1.default().subtract(riskGroup.frequency.value, riskGroup.frequency.unit).format('YYYYMMDD'));
                        if (!this.hasBeenDoneInRequiredInterval(fields, dateAndFieldEntries, whenShouldHaveBeenDoneLast, fieldMatch)) {
                            dlogger(`Processing patient ${patient._id} for risk ${risk.name} for riskgroup ${riskGroup.severity} - patient matched criteria, NOT done in last ${riskGroup.frequency.value} ${riskGroup.frequency.unit}`);
                            results.push({
                                message: riskGroup.message, name: risk.name, severity: RiskResultSeverity.normal, actions: riskGroup.actions
                            });
                        }
                        else {
                            dlogger(`Processing patient ${patient._id} for risk ${risk.name} for riskgroup ${riskGroup.severity} - patient matched criteria, done in last ${riskGroup.frequency.value} ${riskGroup.frequency.unit}`);
                        }
                    }
                }
            });
        }
    }
    processPatient(redbook, patient) {
        logger(`processing patient ${patient._id} using redbook config`);
        const results = [];
        if (redbook.risks) {
            redbook.risks.forEach((risk) => {
                logger(`processing patient ${patient._id} for risk ${risk.name}`);
                this.processRisk(patient, risk, results);
            });
        }
        return results;
    }
}
exports.RedBookProcessor = RedBookProcessor;
//# sourceMappingURL=RedBookProcessor.js.map