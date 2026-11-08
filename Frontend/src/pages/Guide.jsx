import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../auth';

const steps = [
  ['01', 'Open a dispute', 'Choose someone who has an account and describe the issue in your own words.'],
  ['02', 'Share both perspectives', 'Each person writes their side and can attach links that add useful context.'],
  ['03', 'Review a path forward', 'Once both sides submit, the AI outlines the perspectives, gaps, and a possible resolution.'],
];

export default function Guide() {
  const { user } = useAuth();
  return <div className="guide-page">
    <div className="page-head"><div><p className="eyebrow">The process</p><h1>Make space for a better conversation.</h1><p className="lead">A little structure makes a difficult conversation easier to start.</p></div></div>
    <div className="guide-grid">
      {steps.map(([number, title, body]) => <article className="guide-step" key={number}><span className="step-number">{number}</span><h2>{title}</h2><p>{body}</p></article>)}
    </div>
    <section className="guide-note"><div><p className="eyebrow">Worth remembering</p><h2>A suggestion is a starting point.</h2><p>AI can help identify common ground, but both people decide what feels fair. Keep private details out of evidence links you do not want to share.</p></div><Link className="button" to={user ? '/' : '/register'}>{user ? 'Go to disputes' : 'Get started'} <Icon name="arrow" size={16}/></Link></section>
  </div>;
}
