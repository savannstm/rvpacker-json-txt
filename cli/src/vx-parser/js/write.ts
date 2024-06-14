import { writeFileSync, readFileSync } from "fs";
import { dump } from "@hyrious/marshal";
import { deflateSync } from "zlib";

import { getValueBySymbolDesc, setValueBySymbolDesc } from "./symbol-utils";

function mergeSeq(json: object[]): object[] {
    let first: null | number = null;
    let number: number = -1;
    let prev: boolean = false;
    const stringArray: string[] = [];

    for (let i = 0; i < json.length; i++) {
        const object = json[i];
        const code: number = getValueBySymbolDesc(object, "@code");

        if (code === 401) {
            if (first === null) {
                first = i;
            }

            number += 1;
            stringArray.push(getValueBySymbolDesc(object, "@parameters")[0]);
            prev = true;
        } else if (i > 0 && prev && first !== null && number !== -1) {
            const parameters = getValueBySymbolDesc(json[first], "@parameters");
            parameters[0] = stringArray.join("\n");
            setValueBySymbolDesc(json[first], "@parameters", parameters);

            const startIndex = first + 1;
            const itemsToDelete = startIndex + number;
            json.splice(startIndex, itemsToDelete);

            stringArray.length = 0;
            i -= number;
            number = -1;
            first = null;
            prev = false;
        }
    }

    return json;
}

export function mergeMap(obj: object): object {
    const events: object = getValueBySymbolDesc(obj, "@events");

    for (const event of Object.values(events || {})) {
        const pages: object[] = getValueBySymbolDesc(event, "@pages");
        if (!pages) {
            continue;
        }

        for (const page of pages) {
            const list: object[] = getValueBySymbolDesc(page, "@list");
            setValueBySymbolDesc(page, "@list", mergeSeq(list));
        }
    }

    return obj;
}

export function mergeOther(objArr: object[]): object[] {
    for (const obj of objArr) {
        if (!obj) {
            continue;
        }

        const pages: object[] = getValueBySymbolDesc(obj, "@pages");

        if (Array.isArray(pages)) {
            for (const page of pages) {
                const list: object[] = getValueBySymbolDesc(page, "@list");
                setValueBySymbolDesc(page, "@list", mergeSeq(list));
            }
        } else {
            const list: object[] = getValueBySymbolDesc(obj, "@list");

            if (Array.isArray(list)) {
                setValueBySymbolDesc(obj, "@list", mergeSeq(list));
            }
        }
    }

    return objArr;
}

export function writeMap(
    objMap: Map<string, object>,
    outputDir: string,
    textTranslationMap: Map<string, string>,
    namesTranslationMap: Map<string, string>,
    logging: boolean,
    logString: string
): void {
    for (const [filename, obj] of objMap) {
        const displayName: string = getValueBySymbolDesc(obj, "@display_name");

        if (namesTranslationMap.has(displayName)) {
            setValueBySymbolDesc(obj, "@display_name", namesTranslationMap.get(displayName)!);
        }

        const events: object = getValueBySymbolDesc(obj, "@events");

        for (const event of Object.values(events || {})) {
            const pages: object[] = getValueBySymbolDesc(event, "@pages");
            if (!pages) {
                return;
            }

            for (const page of pages) {
                const list: object[] = getValueBySymbolDesc(page, "@list");

                for (const item of list || []) {
                    const code: number = getValueBySymbolDesc(item, "@code");
                    const parameters: string[] = getValueBySymbolDesc(item, "@parameters");

                    for (const [i, parameter] of parameters.entries()) {
                        if (typeof parameter === "string") {
                            if (
                                [401, 402, 324].includes(code) ||
                                (code === 356 &&
                                    (parameter.startsWith("GabText") ||
                                        (parameter.startsWith("choice_text") && !parameter.endsWith("????"))))
                            ) {
                                if (textTranslationMap.has(parameter)) {
                                    parameters[i] = textTranslationMap.get(parameter)!;
                                    setValueBySymbolDesc(item, "@parameters", parameters);
                                }
                            }
                        } else if (code == 102 && Array.isArray(parameter)) {
                            for (const [j, param] of (parameter as string[]).entries()) {
                                if (typeof param === "string") {
                                    if (textTranslationMap.has(param.replaceAll("\\n[", "\\N["))) {
                                        (parameters[i][j] as string) = textTranslationMap.get(
                                            param.replaceAll("\\n[", "\\N[")
                                        )!;

                                        setValueBySymbolDesc(item, "@parameters", parameters);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (logging) {
                console.log(`${logString} ${filename}`);
            }
        }

        writeFileSync(`${outputDir}/${filename}`, dump(obj));
    }
}

export function writeOther(
    objMap: Map<string, object[]>,
    outputDir: string,
    otherDir: string,
    logging: boolean,
    logString: string,
    drunk: number
): void {
    for (const [filename, objArr] of objMap) {
        const otherOriginalText = readFileSync(
            `${otherDir}/${filename.slice(0, filename.lastIndexOf("."))}.txt`,
            "utf8"
        )
            .split("\n")
            .map((string) => string.replaceAll("\\n", "\n"));

        let otherTranslatedText = readFileSync(
            `${otherDir}/${filename.slice(0, filename.lastIndexOf("."))}_trans.txt`,
            "utf8"
        )
            .split("\n")
            .map((string) => string.replaceAll("\\r\\n", "\r\n").replaceAll("\\n", "\n"));

        if (drunk > 0) {
            otherTranslatedText = otherTranslatedText.shuffle();

            if (drunk === 2) {
                otherTranslatedText = otherTranslatedText.map((string) => {
                    return string
                        .split("\n")
                        .map((line) => line.split(" ").shuffle().join(" "))
                        .join("\n");
                });
            }
        }

        const translationMap = new Map(otherOriginalText.map((string, i) => [string, otherTranslatedText[i]]));

        if (!filename.startsWith("Common") && !filename.startsWith("Troops")) {
            for (const obj of objArr) {
                if (!obj) {
                    continue;
                }

                const name: string = getValueBySymbolDesc(obj, "@name");
                const description: string = getValueBySymbolDesc(obj, "@description");
                const note: string = getValueBySymbolDesc(obj, "@note");

                if (translationMap.has(name)) {
                    setValueBySymbolDesc(obj, "@name", translationMap.get(name));
                }

                if (typeof description === "string" && translationMap.has(description)) {
                    setValueBySymbolDesc(obj, "@description", translationMap.get(description));
                }

                if (translationMap.has(note)) {
                    setValueBySymbolDesc(obj, "@note", translationMap.get(note));
                }
            }
        } else {
            for (const obj of objArr.slice(1)) {
                const pages: object[] = getValueBySymbolDesc(obj, "@pages");
                const pagesLength = filename == "Troops.rvdata2" ? pages.length : 1;

                for (let i = 0; i < pagesLength; i++) {
                    const list =
                        filename == "Troops.rvdata2"
                            ? getValueBySymbolDesc(pages[i], "@list")
                            : getValueBySymbolDesc(obj, "@list");

                    if (!Array.isArray(list)) {
                        for (const item of list) {
                            const code: number = getValueBySymbolDesc(item, "@code");
                            const parameters: string[] = getValueBySymbolDesc(item, "@parameters");

                            for (const [i, parameter] of parameters.entries()) {
                                if (typeof parameter === "string") {
                                    if (
                                        [401, 402, 324].includes(code) ||
                                        (code === 356 &&
                                            (parameter.startsWith("GabText") ||
                                                (parameter.startsWith("choice_text") && !parameter.endsWith("????"))))
                                    ) {
                                        if (translationMap.has(parameter)) {
                                            parameters[i] = translationMap.get(parameter)!;

                                            setValueBySymbolDesc(item, "@parameters", parameters);
                                        }
                                    }
                                } else if (code === 102 && Array.isArray(parameter)) {
                                    for (const [j, param] of (parameter as string[]).entries()) {
                                        if (typeof param === "string") {
                                            if (translationMap.has(param.replaceAll("\\n[", "\\N["))) {
                                                (parameters[i][j] as string) = translationMap.get(
                                                    param.replaceAll("\\n[", "\\N[")
                                                )!;

                                                setValueBySymbolDesc(item, "@parameters", parameters);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (logging) {
            console.log(`${logString} ${filename}`);
        }

        writeFileSync(`${outputDir}/${filename}`, dump(objArr));
    }
}

export function writeSystem(
    obj: object,
    outputDir: string,
    translationMap: Map<string, string>,
    logging: boolean,
    logString: string
): void {
    const symbols = ["@skill_types", "@weapon_types", "@armor_types", "@currency_unit", "@terms"];
    const [skillTypes, weaponTypes, armorTypes, currencyUnit, terms] = symbols.map((symbol) =>
        getValueBySymbolDesc(obj, symbol)
    );

    for (const [i, arr] of [skillTypes, weaponTypes, armorTypes].entries()) {
        for (const [j, element] of arr.entries()) {
            if (element && translationMap.has(element)) {
                arr[j] = translationMap.get(element);

                setValueBySymbolDesc(obj, symbols[i], arr);
            }
        }
    }

    setValueBySymbolDesc(obj, currencyUnit, translationMap.get(currencyUnit));

    const termsSymbols = Object.getOwnPropertySymbols(terms);
    const termsValues = termsSymbols.map((symbol) => terms[symbol]);

    for (let i = 0; i < termsSymbols.length; i++) {
        for (const [j, termValue] of termsValues.entries()) {
            if (translationMap.has(termValue[j])) {
                termValue[j] = translationMap.get(termValue[j])!;
            }

            setValueBySymbolDesc(terms, termsSymbols[i].description as string, termValue);
        }
    }

    if (logging) {
        console.log(`${logString} System.rvdata2`);
    }

    writeFileSync(`${outputDir}/System.rvdata2`, dump(obj));
}

export function writeScripts(
    obj: Uint8Array[][],
    translationArr: string[],
    outputDir: string,
    logging: boolean,
    logString: string
): void {
    const decoder = new TextDecoder();

    for (let i = 0; i < obj.length; i++) {
        if (obj[i][0] instanceof Uint8Array) {
            obj[i][0] = decoder.decode(obj[i][0]);
        }
        if (obj[i][1] instanceof Uint8Array) {
            obj[i][1] = decoder.decode(obj[i][1]);
        }

        obj[i][2] = deflateSync(translationArr[i].replaceAll("\\n", "\r\n"), { level: 6 });
    }

    if (logging) {
        console.log(`${logString} Scripts.rvdata2`);
    }

    writeFileSync(`${outputDir}/Scripts.rvdata2`, dump(obj));
}
