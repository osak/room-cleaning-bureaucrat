import { formatISO, parseISO, add, isAfter } from 'npm:date-fns@2.30';

class NotionError {
    constructor(readonly blob: any) {}
}

interface RawNotionQueryResponse {
    object: 'list';
    results: RawNotionRow[];
}

interface RawNotionRow {
    object: string;
    id: string;
    last_edited_time: string;
    properties: Record<string, RawNotionProperty>;
}

interface RawSelectProperty {
    id: string;
    type: 'select';
    select: null | {
        id: string;
        name: string;
    }
}

interface RawDateProperty {
    id: string;
    type: 'date';
    date: null | {
        start: string;
        end: string | null;
        time_zone: string | null;
    }
}

interface SelectProperty {
    id: string;
    value?: {
        id: string;
        name: string;
    }
}

type RawNotionProperty = RawSelectProperty | RawDateProperty;

const FREQ_MAP: Record<string, Duration> = {
    '週2': { days: 3 },
    '週1': { weeks: 1 },
    '隔週': { weeks: 2 },
    '月1': { months: 1 },
};

function parseSelectProperty(property: RawNotionProperty): SelectProperty {
    if (property.type != 'select') {
        throw new Error(`Property ${property.id} is not a 'select' property, but it's '${property.type}'.`);
    }
    const body = property.select;
    if (body == null) {
        return {
            id: property.id
        };
    } else {
        return {
            id: property.id,
            value: {
                id: body.id,
                name: body.name,
            }
        };
    }
}

function parseDateProperty(property: RawNotionProperty): Date | null {
    if (property.type != 'date') {
        throw new Error(`Property ${property.id} is not a 'date' property, but it's '${property.type}'.`);
    }
    const body = property.date;
    if (body == null) {
        return null;
    } else {
        return parseISO(body.start);
    }
}

function getProperty(row: RawNotionRow, name: string): RawNotionProperty {
    const prop = row.properties[name];
    if (prop == undefined) {
        throw new Error(`Page ${row.id} does not contain the status property.`);
    }
    return prop;
}

class Row {
    constructor(
        readonly id: string,
        readonly lastEdited: Date,
        readonly lastDone: Date | null,
        readonly nextDue: Date | null,
        readonly status: SelectProperty,
        readonly frequency: Duration,
    ) { }

    // Parses a row representation in Notion response into a Row instance.
    static parseRow(blob: RawNotionRow): Row {
        if (blob.object != 'page') {
            throw new Error(`Unsupported row type: ${blob.object} for row id ${blob.id}`);
        }

        const lastEdited = parseISO(blob.last_edited_time);
        const statusProperty = parseSelectProperty(getProperty(blob, '状態'));
        const lastDoneProperty = parseDateProperty(getProperty(blob, '最後にやった日'));
        const nextDueProperty = parseDateProperty(getProperty(blob, '次にやる日'));
        const frequencyProperty = parseSelectProperty(getProperty(blob, '頻度'));
        if (frequencyProperty.value == undefined) {
            throw new Error(`${blob.id} has no frequency set.`);
        }
        const freq = FREQ_MAP[frequencyProperty.value.name];
        if (freq == undefined) {
            throw new Error(`Unknown frequency in ${blob.id}: '${frequencyProperty.value.name}'`);
        }

        return new Row(blob.id, lastEdited, lastDoneProperty, nextDueProperty, statusProperty, FREQ_MAP[frequencyProperty.value.name]);
    }
}

export interface Config {
    apiKey: string;
    databaseId: string;
}

async function handleError(response: Response) {
    const body = await response.json();
    throw new NotionError(body);
}

async function api<T>(config: Config, path: string, method: string = 'GET', payload: any | null = null): Promise<T> {
    const options: RequestInit = {
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
        },
        method: method,
    };
    if (payload != null) {
        options.body = JSON.stringify(payload);
    }

    const response = await fetch(`https://api.notion.com/v1/${path}`, options);
    if (response.status != 200) {
        await handleError(response);
    }

    return await response.json();
}

async function listDB(config: Config): Promise<RawNotionQueryResponse> {
    return api(config, `databases/${config.databaseId}/query`, 'POST', {});
}

async function updatePageProperty(config: Config, pageId: string, properties: Record<string, any>) {
    return api(config, `pages/${pageId}`, 'PATCH', {
        properties: properties
    });
}

async function markRowAsCompleted(config: Config, row: Row) {
    await updatePageProperty(config, row.id, {
        "状態": { select: { name: "まだ" }},
        "最後にやった日": { date: { start: formatISO(row.lastEdited) }},
        "次にやる日": { date: { start: formatISO(add(row.lastEdited, row.frequency)) }}
    });
}

async function markRowAsTodo(config: Config, row: Row) {
    await updatePageProperty(config, row.id, {
        "状態": { select: { name: "やる" }},
    });
}

export async function run(config: Config) {
    const rawDB = await listDB(config);
    const rows = rawDB.results.map((r) => Row.parseRow(r));
    for (const row of rows) {
        if (row.status.value?.name == "やった") {
            console.log(`Updating ${row.id} as completed...`);
            try {
                await markRowAsCompleted(config, row);
            } catch (e) {
                console.error(`Failed to update row ${row.id}`, e);
            }
        } else if (row.status.value?.name == "まだ") {
            console.log(`Checking ${row.id} for if it's past the due date...`);
            if (row.nextDue == null || isAfter(Date.now(), row.nextDue)) {
                console.log(`Updating ${row.id} as to-do.`);
                try {
                    await markRowAsTodo(config, row);
                } catch (e) {
                    console.error(`Failed to update row ${row.id}`, e);
                }
            }
        }
    }
}