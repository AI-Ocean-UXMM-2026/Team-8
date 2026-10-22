import unittest
from test_foundation import uid
from unittest.mock import patch
from types import SimpleNamespace
from app.features.ai.service import CheckReview, OpenAIChecker, proposal_hash, run_job
from app.features.ai.evidence import EvidenceReader, EvidenceUnavailable

ID = '00000000-0000-4000-8000-000000000001'


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = {'lease_token': ID, 'policy_version': 1, 'facts': {'shortage_qty': 0},
            'allowed_actions': ['save_summary'], 'case': {'id': ID, 'type': 'courier_delay', 'priority': 'normal', 'summary': 'Recorded delay', 'evidence': []},
            'evidence_content': [{'type': 'input_text', 'text': 'Untrusted evidence'}]}
        self.output = {'requires_human': False}

    def test_checker_is_separate_request_and_all_checks_must_pass(self):
        import json
        calls = []
        self.snapshot.update(source_version='source-1', shipment={'id': ID}, inventory=[], policy_rules={})
        self.snapshot['case']['evidence'] = []
        maker = {'output': self.output, 'provider_response_id': 'maker-response'}
        verdict = dict(verdict='rejected', source_version='source-1', proposal_hash=proposal_hash(self.output),
            evidence_supported=True, classification_correct=True, priority_correct=True,
            action_authorized=False, findings=['Unsupported action'])
        def parse(**kw):
            calls.append(kw)
            return SimpleNamespace(output_parsed=CheckReview(**verdict), model='checker-returned', id='checker-response', usage=None)
        checker = OpenAIChecker.__new__(OpenAIChecker)
        checker.model = 'checker-configured'
        checker.client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
        saved = checker.review(self.snapshot, maker)
        self.assertEqual(saved['output']['verdict'], 'rejected')
        self.assertEqual(saved['provider_response_id'], 'checker-response')
        self.assertEqual(calls[0]['model'], 'checker-configured')
        self.assertFalse(calls[0]['store'])
        self.assertNotIn('previous_response_id', calls[0])
        self.assertEqual(calls[0]['input'][0]['content'][-1], self.snapshot['evidence_content'][0])
        self.assertEqual(json.loads(calls[0]['input'][0]['content'][0]['text'])['source']['source_version'], 'source-1')

    def test_checker_failure_preserves_maker_but_never_supplies_approval(self):
        owner = self
        self.output = {'exception_type': 'courier_delay', 'priority': 'normal', 'summary': 'Recorded delay',
            'evidence_ids': [], 'recommended_action': 'save_summary', 'requires_human': False, 'missing_information': []}
        class Database:
            def rpc(self, name, params): return owner.snapshot if name == 'analysis_claim' else params
        class Provider:
            auto_execute = True
            def investigate(self, snapshot):
                return {'output': owner.output.copy(), 'provider_response_id': 'maker-response', 'model': 'maker'}
        class Checker:
            def review(self, snapshot, maker): raise RuntimeError('private provider details')
        result = run_job(Database(), Provider(), ID, Checker())
        self.assertIsNone(result['p_result']['checker'])
        self.assertEqual(result['p_result']['checker_error'], 'provider_unavailable')
        self.assertEqual(result['p_result']['maker']['output'], self.output)
        self.assertNotIn('private provider details', repr(result))
        self.assertIsNone(result['p_error'])

    def test_evidence_reader_sends_bytes_as_content_without_urls_or_credentials(self):
        raw = b'\x89PNG\r\n\x1a\n'
        snapshot = {'evidence_files': [{'id': ID, 'mime_type': 'image/png', 'size_bytes': len(raw), 'object_path': 'warehouse/shipment/image.png'}]}
        class Stream:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def raise_for_status(self): pass
            def iter_bytes(self): yield raw
        reader = EvidenceReader(SimpleNamespace(supabase_url='https://project.supabase.co', supabase_worker_key='secret'))
        with patch('app.features.ai.evidence.httpx.stream', return_value=Stream()) as network:
            parts, consumed, omitted = reader.read(snapshot)
        self.assertEqual(consumed, [ID]); self.assertFalse(omitted)
        self.assertEqual(parts[1]['type'], 'input_image')
        self.assertTrue(parts[1]['image_url'].startswith('data:image/png;base64,'))
        self.assertNotIn('secret', repr(parts)); self.assertNotIn('object_path', repr(parts))
        self.assertFalse(network.call_args.kwargs['follow_redirects'])
        snapshot['evidence_files'][0]['size_bytes'] = len(raw)+1
        with patch('app.features.ai.evidence.httpx.stream', return_value=Stream()), self.assertRaises(EvidenceUnavailable): reader.read(snapshot)

    def test_pdf_and_omitted_evidence_are_explicit(self):
        raw=b'%PDF-1.7'
        class Stream:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def raise_for_status(self): pass
            def iter_bytes(self): yield raw
        reader=EvidenceReader(SimpleNamespace(supabase_url='https://project.supabase.co',supabase_worker_key='secret'))
        snapshot={'evidence_files':[{'id':str(n),'mime_type':'application/pdf','size_bytes':len(raw),'object_path':'file.pdf'} for n in range(4)]}
        with patch('app.features.ai.evidence.httpx.stream',return_value=Stream()): parts,consumed,omitted=reader.read(snapshot)
        self.assertTrue(omitted);self.assertEqual(len(consumed),3)
        self.assertEqual(parts[1]['type'],'input_file');self.assertTrue(parts[1]['file_data'].startswith('data:application/pdf;base64,'))
