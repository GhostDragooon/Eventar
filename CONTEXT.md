# Eventar

A CPD/CME compliance platform for regulated professions in Hong Kong. Practitioners attend accredited events; Eventar records attendance and issues tamper-evident credit that their regulator will accept.

## Language

### Bodies and identity

**Accrediting body**:
An organisation that defines CPD requirements and accepts credit toward them. Modelled as one row per body, including Specialty Colleges, which are child rows of their parent Academy.
_Avoid_: regulator, authority, institution

**Specialty College**:
A body under the Hong Kong Academy of Medicine that sets its own CPD rules for its Fellows. **A College is an accrediting body**, not a separate kind of thing.
_Avoid_: specialty, discipline, college body

**Track**:
Which regulatory regime governs a practitioner's CPD — MCHK (general registration) or HKAM (specialist, via a College). **A property of the body, not of the licence**: a licence is on the HKAM track precisely because its body sits under HKAM.
_Avoid_: pathway, stream, route, registration type

**Licence**:
One practitioner's standing with one body, carrying the number that body knows them by. A practitioner holds one licence per body they answer to.
_Avoid_: registration, membership, credential, fellowship record

**Fellow**:
A practitioner holding a Fellowship of a Specialty College. HKAM's own term; use it only when speaking about HKAM specialists.
_Avoid_: member, specialist doctor

### Activity and measurement

**Point**:
The unit a body counts toward its requirement. For HKAM, one hour of attendance at an FCAA is ordinarily one point — but chairing or presenting the same activity is worth more, so points are **not** a synonym for hours.
_Avoid_: credit, unit, CPD credit

**Hour**:
Measured duration of presence. An input to the points calculation, never the output.
_Avoid_: time, duration, contact hour

**FCAA** (Formal College Approved Activity):
An activity a College has approved for CPD. The thing Eventar calls an event, seen from the body's side.
_Avoid_: approved activity, accredited event

**Activity category**:
Which of the body's numbered categories an individual's participation falls under — HKAM defines sixteen (6.1–6.16), each with its own cap. **A property of a person's participation, not of the event**: an attendee at a meeting is 6.1, the chair of that same meeting is 6.2.
_Avoid_: activity type, taxonomy tag, participation type

**Passive participation**:
Attending as an audience member (HKAM 6.1). Capped at 75 points per cycle.
_Avoid_: attendance credit, passive learning

**Active participation**:
Chairing or presenting (HKAM 6.2). Worth more than attendance, and the multiplier is set by each College.
_Avoid_: contribution, faculty role

**Cycle**:
The period over which a body measures compliance. HKAM's is three years, minimum 90 points. **A Fellow holding Fellowships at several Colleges must satisfy each College separately.**
_Avoid_: period, term, reporting window

### Credit and evidence

**Credit ledger entry**:
One immutable, hash-chained record that a practitioner earned (or had adjusted) credit for an activity. Keyed to a licence, because compliance is owed per body.
_Avoid_: credit record, transaction, award

**Attestation**:
How strongly the platform can vouch for a credit — from an organiser's assertion, through verified attendance, to a body's confirmation.
_Avoid_: verification level, trust, proof

**Rule pack**:
A body's point rules as Eventar applies them, versioned as code. Its output is snapshotted into the ledger entry; the entry never references it.
_Avoid_: body rules, rule config, evaluator

**Cycle return**:
The summary of a Fellow's points that a College submits to the Academy at the end of a cycle. The thing Eventar's export exists to produce.
_Avoid_: report, submission, export file

### Attendance

**Check-in**:
The recorded moment a practitioner's presence at an event is witnessed.
_Avoid_: scan, arrival, admission

**Check-out**:
The recorded moment their presence ends. Absent by default — most practitioners do not scan out.
_Avoid_: departure scan, sign-out

**Minutes attended**:
Measured presence between check-in and check-out. Distinct from the event's scheduled length and from the hours finally credited.
_Avoid_: duration, attendance time, time present
