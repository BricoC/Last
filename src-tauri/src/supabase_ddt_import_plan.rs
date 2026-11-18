use super::{DdtImportHeader, DdtImportLine, DdtImportPayload, DdtImportResult};
use sqlx::SqliteConnection;
use std::collections::{HashMap, HashSet};

#[derive(sqlx::FromRow)]
struct LocalHeader {
    id: String,
    year: i64,
    doc_number: Option<i64>,
    sync_status: String,
    deleted_at: Option<String>,
}

fn document_key(year: i64, number: i64) -> (i64, i64) {
    (year, number)
}

async fn local_headers(
    connection: &mut sqlx::SqliteConnection,
) -> Result<Vec<LocalHeader>, String> {
    sqlx::query_as::<_, LocalHeader>(
        "SELECT id, year, doc_number, sync_status, deleted_at FROM ddt_documents",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Impossibile controllare i DDT locali: {error}"))
}

pub(super) struct ImportPlan<'a> {
    pub(super) headers: Vec<&'a DdtImportHeader>,
    pub(super) lines: Vec<&'a DdtImportLine>,
    pub(super) result: DdtImportResult,
}

pub(super) async fn classify_import<'a>(
    connection: &mut SqliteConnection,
    payload: &'a DdtImportPayload,
) -> Result<ImportPlan<'a>, String> {
    let local = local_headers(connection).await?;
    let local_by_id: HashMap<String, &LocalHeader> = local
        .iter()
        .map(|header| (header.id.clone(), header))
        .collect();
    let mut active_numbers = HashSet::new();
    for header in &local {
        if header.deleted_at.is_none() {
            if let Some(number) = header.doc_number {
                active_numbers.insert(document_key(header.year, number));
            }
        }
    }

    let mut cloud_key_counts: HashMap<(i64, i64), usize> = HashMap::new();
    let mut cloud_id_counts = HashMap::new();
    for header in &payload.headers {
        *cloud_key_counts
            .entry(document_key(header.year, header.doc_number))
            .or_default() += 1;
        *cloud_id_counts.entry(&header.id).or_insert(0usize) += 1;
    }
    let is_duplicate = |header: &DdtImportHeader| {
        cloud_key_counts[&document_key(header.year, header.doc_number)] > 1
            || cloud_id_counts[&header.id] > 1
    };
    let duplicate_cloud_headers = payload
        .headers
        .iter()
        .filter(|header| is_duplicate(header))
        .count();
    let mut candidate_ids = HashSet::new();
    let mut conflicts = 0usize;
    let mut already_present = 0usize;

    for header in &payload.headers {
        let key = document_key(header.year, header.doc_number);
        if is_duplicate(header) {
            conflicts += 1;
        } else if let Some(existing) = local_by_id.get(&header.id) {
            if existing.deleted_at.is_none()
                && existing.year == header.year
                && existing.doc_number == Some(header.doc_number)
                && existing.sync_status == "synced"
            {
                already_present += 1;
            } else {
                conflicts += 1;
            }
        } else if active_numbers.contains(&key) {
            conflicts += 1;
        } else {
            candidate_ids.insert(header.id.clone());
        }
    }

    let mut orphan_lines = 0usize;
    let mut candidate_lines: Vec<&DdtImportLine> = Vec::new();
    let line_ids = sqlx::query_scalar::<_, String>("SELECT id FROM ddt_items")
        .fetch_all(connection)
        .await
        .map_err(|error| format!("Impossibile controllare gli UUID delle righe locali: {error}"))?;
    let existing_line_ids: HashSet<String> = line_ids.into_iter().collect();
    let mut line_id_conflicts = 0usize;
    let mut headers_with_line_id_conflict = HashSet::new();
    let mut line_counts = HashMap::new();
    for line in &payload.lines {
        if line
            .cloud_header_id
            .as_ref()
            .is_some_and(|id| candidate_ids.contains(id))
        {
            *line_counts.entry(&line.id).or_insert(0usize) += 1;
        }
    }
    for line in &payload.lines {
        let Some(header_id) = line.cloud_header_id.as_deref() else {
            orphan_lines += 1;
            continue;
        };
        if !candidate_ids.contains(header_id) {
            continue;
        }
        if existing_line_ids.contains(&line.id) || line_counts[&line.id] > 1 {
            line_id_conflicts += 1;
            headers_with_line_id_conflict.insert(header_id.to_string());
        } else {
            candidate_lines.push(line);
        }
    }
    for header_id in headers_with_line_id_conflict {
        candidate_ids.remove(&header_id);
        conflicts += 1;
    }
    candidate_lines.retain(|line| {
        line.cloud_header_id
            .as_ref()
            .is_some_and(|id| candidate_ids.contains(id))
    });

    let candidate_headers: Vec<&DdtImportHeader> = payload
        .headers
        .iter()
        .filter(|header| candidate_ids.contains(&header.id))
        .collect();
    Ok(ImportPlan {
        headers: candidate_headers,
        lines: candidate_lines,
        result: DdtImportResult {
            imported_headers: 0,
            imported_lines: 0,
            already_present,
            conflicts,
            duplicate_cloud_headers,
            orphan_lines,
            line_id_conflicts,
            backup_path: None,
        },
    })
}
