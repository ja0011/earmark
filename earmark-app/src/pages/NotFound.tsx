import { Link } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';

export default function NotFound() {
  return (
    <AppLayout title="Not found">
      <h1 className="display text-[clamp(3rem,8vw,6rem)]">NOTHING HERE.</h1>
      <p className="mt-4 text-[20px]">This page isn't earmarked for anything.</p>
      <Link to="/" className="btn btn-seal mt-8">Back to Earmark</Link>
    </AppLayout>
  );
}
