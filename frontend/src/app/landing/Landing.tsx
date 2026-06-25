'use client'

/**
 * Landing oficial de Achilltest.
 * Componente React equivalente al landing.html.
 *
 * Carga el HTML embebido y los scripts de interactividad
 * (hamburger menu, smooth scroll, reveal on scroll).
 */

import { useEffect } from 'react'
import './landing.css'

export default function Landing() {
  useEffect(() => {
    // ── Nav solid on scroll ────────────────────────────────────────────────
    const nav = document.getElementById('al-nav')
    const onScroll = () => nav?.classList.toggle('solid', window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })

    // ── Hamburger ──────────────────────────────────────────────────────────
    const hbg    = document.getElementById('al-hbg')
    const mnav   = document.getElementById('al-mnav')
    const mclose = document.getElementById('al-mclose')

    const closeMnav = () => {
      hbg?.classList.remove('open')
      mnav?.classList.remove('open')
      document.body.style.overflow = ''
    }

    const openMnav = () => {
      hbg?.classList.toggle('open')
      mnav?.classList.toggle('open')
      document.body.style.overflow = mnav?.classList.contains('open') ? 'hidden' : ''
    }

    hbg?.addEventListener('click', openMnav)
    mclose?.addEventListener('click', closeMnav)

    // ── Smooth scroll para anclas ──────────────────────────────────────────
    const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
    const onAnchor = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement
      const target = document.querySelector(a.getAttribute('href') || '')
      if (!target) return
      e.preventDefault()
      closeMnav()
      window.scrollTo({
        top: target.getBoundingClientRect().top + window.scrollY - 68,
        behavior: 'smooth',
      })
    }
    anchors.forEach(a => a.addEventListener('click', onAnchor))

    // ── Reveal on scroll ───────────────────────────────────────────────────
    const reveals = document.querySelectorAll('.al-reveal')
    const io = new IntersectionObserver(entries => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return
        setTimeout(() => entry.target.classList.add('in'), i * 55)
        io.unobserve(entry.target)
      })
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' })
    reveals.forEach(el => io.observe(el))

    return () => {
      window.removeEventListener('scroll', onScroll)
      hbg?.removeEventListener('click', openMnav)
      mclose?.removeEventListener('click', closeMnav)
      anchors.forEach(a => a.removeEventListener('click', onAnchor))
      io.disconnect()
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <>
      {/* Mobile overlay */}
      <div className="al-mobile-nav" id="al-mnav">
        <button className="al-mobile-nav-close" id="al-mclose">✕</button>
        <a href="#funciones">Funciones</a>
        <a href="#planes">Planes</a>
        <a href="#america">América</a>
        <div className="al-mobile-nav-cta">
          <a href="/login" className="al-btn al-btn-ghost" style={{width:'100%',justifyContent:'center',border:'1px solid var(--al-border2)'}}>
            Iniciar sesión
          </a>
          <a href="/register" className="al-btn al-btn-primary" style={{width:'100%',justifyContent:'center'}}>
            Empezar gratis
          </a>
        </div>
      </div>

      {/* NAV */}
      <nav className="al-nav" id="al-nav">
        <a href="/" aria-label="Achilltest">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" style={{height:'26px',width:'auto',display:'block'}}>
            <defs><style>{`.nh{fill:#fff}`}</style></defs>
            <g><path className="nh" d="M284.2,320.5l-15.1,33.6h6.4l3.3-7.8h16.8l3.3,7.8h6.6l-15.1-33.6h-6.1ZM280.9,341.4l6.3-14.7,6.3,14.7h-12.6Z"/><path className="nh" d="M316.6,334.2c1.2-.7,2.5-1,4-1s2.5.3,3.6.9c1.1.6,2,1.5,2.8,2.7l4.6-2.7c-1-1.9-2.4-3.4-4.3-4.5-1.9-1-4.1-1.5-6.6-1.5s-5.1.6-7.2,1.7c-2.1,1.1-3.7,2.7-4.9,4.6-1.2,1.9-1.8,4.2-1.8,6.8s.6,4.8,1.8,6.8c1.2,2,2.8,3.5,4.9,4.6,2.1,1.1,4.5,1.7,7.2,1.7s4.6-.5,6.6-1.6c1.9-1,3.4-2.5,4.3-4.4l-4.6-2.7c-.8,1.2-1.7,2.1-2.8,2.7-1.1.6-2.3.9-3.6.9s-2.8-.3-4-1c-1.2-.7-2.1-1.6-2.8-2.8-.7-1.2-1-2.6-1-4.3s.3-3,1-4.2,1.6-2.1,2.8-2.8Z"/><path className="nh" d="M356.5,329.3c-1.6-.8-3.4-1.2-5.5-1.2s-4.2.4-5.9,1.3c-1,.5-1.9,1.2-2.6,2v-13h-5.9v35.6h5.9v-12.9c0-1.7.3-3.2.9-4.3.6-1.1,1.4-2,2.5-2.6,1.1-.6,2.3-.9,3.7-.9s3.5.6,4.5,1.7c1.1,1.1,1.6,2.8,1.6,5.1v13.9h6v-14.7c0-2.6-.5-4.7-1.4-6.4-.9-1.7-2.2-2.9-3.8-3.7Z"/><rect className="nh" x="369.4" y="328.4" width="5.9" height="25.6"/><rect className="nh" x="383.2" y="318.5" width="5.9" height="35.6"/><rect className="nh" x="397.1" y="318.5" width="5.9" height="35.6"/><path className="nh" d="M421.3,349.4c-1.2,0-2-.3-2.7-1-.6-.7-1-1.6-1-2.8v-12.4h6.9v-4.8h-6.9v-5.7h-5.9v5.7h-4.2v4.8h4.2v12.6c0,2.8.8,4.9,2.3,6.4,1.5,1.5,3.7,2.2,6.5,2.2s2.1-.1,3.1-.4c1-.3,1.9-.7,2.6-1.3l-1.7-4.3c-.9.7-1.9,1.1-3.3,1.1Z"/><path className="nh" d="M448.1,329.8c-1.9-1.1-4.2-1.7-6.7-1.7s-4.8.6-6.8,1.7c-2,1.1-3.6,2.7-4.7,4.6-1.1,2-1.7,4.2-1.7,6.8s.6,4.8,1.7,6.8c1.2,2,2.8,3.5,4.9,4.6,2.1,1.1,4.6,1.7,7.5,1.7s4.2-.4,6-1.1c1.7-.7,3.2-1.7,4.4-3.1l-3.3-3.7c-.9.9-1.9,1.6-3.1,2.1-1.2.5-2.4.7-3.9.7s-3.2-.3-4.5-1c-1.3-.7-2.3-1.6-2.9-2.8-.4-.7-.7-1.6-.9-2.4h20.1c0-.3,0-.6,0-.9s0-.6,0-.8c0-2.7-.6-5.1-1.7-7-1.1-2-2.7-3.5-4.6-4.6ZM435,336.6c.6-1.2,1.5-2,2.6-2.7,1.1-.6,2.4-.9,3.9-.9s2.7.3,3.8.9c1.1.6,1.9,1.5,2.6,2.6.4.8.7,1.7.8,2.6h-14.5c.1-.9.4-1.8.8-2.6Z"/><path className="nh" d="M476.5,340.9c-.9-.5-2-.9-3.1-1.2-1.1-.3-2.2-.5-3.4-.7-1.1-.2-2.2-.4-3.1-.6-.9-.2-1.7-.5-2.3-.9s-.9-1-.9-1.7.4-1.5,1.3-2c.9-.5,2.2-.8,4-.8s2.4.1,3.7.4c1.2.3,2.5.8,3.6,1.5l2.3-4.6c-1.2-.7-2.7-1.3-4.4-1.7-1.8-.4-3.5-.6-5.2-.6s-4.3.3-6,1-3,1.6-3.9,2.8c-.9,1.2-1.4,2.6-1.4,4.2s.3,2.7.9,3.6c.6.9,1.3,1.6,2.3,2.1.9.5,2,.9,3.1,1.2,1.1.3,2.3.5,3.4.6,1.1.2,2.2.3,3.1.5.9.2,1.7.5,2.3.8.6.4.9.9.9,1.6s-.4,1.5-1.3,2c-.8.5-2.2.7-4.1.7s-3.2-.2-4.8-.7c-1.6-.5-3-1.1-4.1-1.8l-2.3,4.6c1.2.8,2.7,1.5,4.7,2,1.9.6,4,.8,6.2.8s4.4-.3,6.2-1c1.7-.7,3-1.6,4-2.7.9-1.2,1.4-2.6,1.4-4.2s-.3-2.6-.9-3.5c-.6-.9-1.3-1.6-2.3-2.1Z"/><path className="nh" d="M498.5,348.4c-.9.7-1.9,1.1-3.3,1.1s-2-.3-2.7-1c-.6-.7-1-1.6-1-2.8v-12.4h6.9v-4.8h-6.9v-5.7h-5.9v5.7h-4.2v4.8h4.2v12.6c0,2.8.8,4.9,2.3,6.4,1.5,1.5,3.7,2.2,6.5,2.2s2.1-.1,3.1-.4c1-.3,1.9-.7,2.6-1.3l-1.7-4.3Z"/></g>
            <g><g><path className="nh" d="M267.9,402.4c-.7,0-2.3-.3-4.9-.8-.2,0-.4,0-.6-.1-9.1-2.2-15.9-14.2-18.3-19.1-.3-.7-.7-1.4-1-2.1l-17.1-36.3c-.8.2-1.6.3-2.4.3s-.2,0-.3,0l-7.3,8.9c.1.6.2,1.2.2,1.7,0,3.2-1.5,6.1-3.9,7.9l12.1,26.6c3.5,15,1.6,18.3,1.6,18.3h6.9c2.2,0,4.7,0,7.3,0,5.6,0,10.4.1,14.5.3,4,.2,8.6.5,13.7.8.2-.3.3-1.2.4-2.8.1-1.6-.2-2.8-.9-3.5Z"/><path className="nh" d="M150.2,356.5l28.8-66.7,25.2,55.4c.6-.1,1.3-.2,2-.2s.5,0,.7,0l7-8.5c-.2-.7-.2-1.4-.2-2.1,0-3.3,1.6-6.2,4.1-8l-30-63.7h-7.3l-55.3,117.9,20.8-16.4c.2-3.2,1.8-6,4.3-7.7Z"/><path className="nh" d="M211.9,352.3l9.8-12c.6.2,1.2.3,1.8.3,3.5,0,6.3-2.8,6.3-6.3s-.3-2.1-.7-2.9l23-27.9c4.9,4.2,9.5,8.2,9.5,8.2l3.6-24.2.6-3.9-5.5,2.2-19.8,7.9c.2,0,3.8,3,7.9,6.6l-23.1,28c-.5-.2-1.1-.2-1.7-.2-3.5,0-6.3,2.8-6.3,6.3s.3,2,.7,2.9l-9.7,11.8c-.7-.2-1.4-.4-2.1-.4-3.5,0-6.3,2.8-6.3,6.3s.4,2.5,1.1,3.5l-14.9,21.4c-.7-.2-1.4-.4-2.2-.4-1.4,0-2.6.4-3.6,1.2l-18.5-14.1c.2-.6.3-1.2.3-1.8,0-3.5-2.8-6.3-6.3-6.3s-6.3,2.8-6.3,6.3,0,.8.1,1.2l-5.2,4.1-23.8,18.7c-6.7,10.2-13.6,13.2-17.7,13.9l-3.6,2.8.2,2.8c1.6,0,3.1-.2,4.6-.3.6,0,1.2,0,1.8,0,1.4,0,2.9-.1,4.5-.2,3,0,6.3-.1,10-.1s5.1,0,7.3,0h0s6.8,0,6.8,0c0,0-1.9-3.3,1.6-18.3l1.2-2.9,3-7,12.1-9.5c1,.6,2.2,1,3.4,1s2-.2,2.8-.7l19.1,14.6c0,.3,0,.6,0,.9,0,3.5,2.8,6.3,6.3,6.3s6.3-2.8,6.3-6.3-.2-1.7-.5-2.5l15.4-22.2c.3,0,.7,0,1,0,3.5,0,6.3-2.8,6.3-6.3s-.2-1.8-.5-2.6Z"/></g><path className="nh" d="M177.5,334.9s-11.2.7-9.7,16c0,0,.5,8.9-1.3,10.7,0,0,4.7,5,9.9,9.2l-1.6-14.6s-4.2-2.5-4.3-3.4,0-3.6,0-3.6l7.8,3.6s1.1,3.3-.2,5.6c0,0,.7,1.7,2.3,3,0,0,1.7-1.2,2.2-3.1,0,0-1-2.2-.5-5.5l8.4-3.8s-.3,5.2-1.8,5.4c0,0-3.3,2.1-3.4,2.8l-1.6,13.9,10.3-9.3s-2.3-4-1.1-10.7-2.1-12.4-2.1-12.4c0,0-3.8-2.8-5.8-3.6l-2.3,6.5s-.1-7.3,3.2-16.8c0,0-4.8-2.7-5.6-3.8,0,0-3.4,3-5.6,4l3,9.9Z"/></g>
          </svg>
        </a>
        <nav className="al-nav-center">
          <a href="#funciones">Funciones</a>
          <a href="#planes">Planes</a>
          <a href="#america">América</a>
        </nav>
        <div className="al-nav-right">
          <a href="/login" className="al-btn al-btn-ghost al-hide-m">Iniciar sesión</a>
          <a href="/register" className="al-btn al-btn-primary al-hide-m">Empezar gratis</a>
          <button className="al-hamburger" id="al-hbg" aria-label="Menú">
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="al-hero">
        <div className="al-hero-glow"></div>
        <div className="al-hero-logo-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792">
            <defs><style>{`.nv{fill:#fff}`}</style></defs>
            <g><path className="nv" d="M104.9,465.6l-29,64.4h12.2l6.4-14.9h32.2l6.4,14.9h12.6l-29.1-64.4h-11.8ZM98.6,505.7l12.1-28.2,12.1,28.2h-24.2Z"/><path className="nv" d="M167.1,491.9c2.3-1.3,4.8-1.9,7.6-1.9s4.7.6,6.9,1.7c2.1,1.1,3.9,2.8,5.4,5.1l8.7-5.1c-1.8-3.7-4.6-6.6-8.3-8.6-3.7-2-7.9-2.9-12.6-2.9s-9.7,1.1-13.7,3.3c-4,2.2-7.2,5.1-9.4,8.9-2.3,3.7-3.4,8.1-3.4,13.1s1.1,9.2,3.4,13c2.3,3.8,5.4,6.7,9.4,8.9,4,2.2,8.6,3.3,13.7,3.3s8.9-1,12.6-3c3.7-2,6.4-4.8,8.3-8.5l-8.7-5.1c-1.5,2.3-3.3,4.1-5.4,5.2-2.1,1.1-4.4,1.7-6.9,1.7s-5.4-.6-7.6-1.9c-2.3-1.3-4-3-5.3-5.4-1.3-2.3-1.9-5.1-1.9-8.2s.6-5.8,1.9-8.1,3.1-4.1,5.3-5.3Z"/><path className="nv" d="M243.7,482.5c-3-1.5-6.5-2.3-10.5-2.3s-8.1.9-11.4,2.6c-2,1-3.6,2.3-5,3.8v-24.9h-11.4v68.2h11.4v-24.8c0-3.3.6-6.1,1.7-8.2,1.1-2.2,2.7-3.8,4.8-4.9,2.1-1.1,4.5-1.7,7.2-1.7s6.6,1.1,8.6,3.2c2,2.1,3,5.4,3,9.7v26.7h11.5v-28.1c0-5-.9-9-2.7-12.2-1.8-3.2-4.2-5.5-7.3-7.1Z"/><path className="nv" d="M274.1,459c-2.1,0-3.9.7-5.3,2-1.4,1.3-2.1,2.9-2.1,4.8s.7,3.6,2.1,5c1.4,1.3,3.1,2,5.3,2s4-.7,5.3-2.1c1.3-1.4,2-3,2-5s-.7-3.6-2.1-4.8c-1.4-1.3-3.1-1.9-5.3-1.9Z"/><rect className="nv" x="268.4" y="480.8" width="11.4" height="49.1"/><rect className="nv" x="294.9" y="461.7" width="11.4" height="68.2"/><rect className="nv" x="321.5" y="461.7" width="11.4" height="68.2"/><path className="nv" d="M368,521.1c-2.2,0-3.9-.6-5.1-1.9-1.2-1.3-1.8-3.1-1.8-5.4v-23.7h13.2v-9.2h-13.2v-10.9h-11.4v10.9h-8.1v9.2h8.1v24.1c0,5.4,1.5,9.5,4.4,12.3,2.9,2.8,7.1,4.2,12.5,4.2s4-.3,6-.8c2-.6,3.6-1.4,5.1-2.5l-3.3-8.2c-1.7,1.3-3.7,2-6.3,2Z"/><path className="nv" d="M419.4,483.4c-3.7-2.1-8-3.2-12.8-3.2s-9.3,1.1-13.1,3.3c-3.8,2.2-6.8,5.1-9,8.9-2.2,3.8-3.3,8.1-3.3,13s1.1,9.2,3.4,13c2.2,3.8,5.4,6.7,9.5,8.9,4.1,2.2,8.8,3.3,14.3,3.3s8.1-.7,11.4-2c3.3-1.3,6.1-3.3,8.4-5.9l-6.3-7.2c-1.7,1.8-3.7,3.1-5.9,4-2.2.9-4.7,1.4-7.4,1.4s-6.1-.6-8.6-1.9c-2.5-1.3-4.3-3-5.7-5.3-.8-1.4-1.4-3-1.7-4.7h38.5c0-.5.1-1.1.1-1.7s0-1.2,0-1.6c0-5.2-1.1-9.7-3.2-13.5-2.1-3.8-5.1-6.8-8.8-8.9ZM394.3,496.5c1.2-2.2,2.8-3.9,5-5.1,2.2-1.2,4.6-1.8,7.4-1.8s5.3.6,7.4,1.8c2.1,1.2,3.7,2.9,4.9,5.1.8,1.5,1.4,3.2,1.6,5h-27.8c.3-1.8.8-3.5,1.6-5Z"/><path className="nv" d="M473.9,504.7c-1.8-.9-3.8-1.7-5.9-2.2-2.1-.5-4.3-.9-6.5-1.3-2.2-.3-4.2-.7-5.9-1.1-1.8-.4-3.2-1-4.3-1.7s-1.7-1.8-1.7-3.3.9-2.9,2.6-3.9c1.7-1,4.3-1.5,7.7-1.5s4.7.3,7.1.8c2.4.5,4.7,1.5,7,2.8l4.5-8.7c-2.3-1.3-5.1-2.4-8.5-3.2-3.4-.8-6.7-1.1-10-1.1s-8.2.6-11.4,1.9-5.7,3.1-7.5,5.4c-1.8,2.3-2.7,5-2.7,8s.6,5.2,1.7,6.9c1.1,1.7,2.5,3.1,4.3,4.1,1.8,1,3.8,1.8,5.9,2.3,2.2.5,4.4.9,6.5,1.2,2.2.3,4.2.6,5.9,1,1.8.4,3.2.9,4.3,1.6,1.1.7,1.7,1.7,1.7,3.1s-.8,3-2.4,3.9c-1.6,1-4.2,1.4-7.8,1.4s-6.2-.4-9.3-1.3c-3.1-.9-5.7-2-7.9-3.4l-4.4,8.7c2.3,1.5,5.3,2.8,9,3.9,3.7,1.1,7.7,1.6,11.9,1.6s8.5-.6,11.8-1.9c3.3-1.3,5.8-3,7.6-5.2,1.8-2.2,2.7-4.9,2.7-8s-.6-5-1.7-6.7c-1.1-1.7-2.6-3-4.4-4Z"/><path className="nv" d="M516.1,519.1c-1.7,1.3-3.7,2-6.3,2s-3.9-.6-5.1-1.9c-1.2-1.3-1.8-3.1-1.8-5.4v-23.7h13.2v-9.2h-13.2v-10.9h-11.4v10.9h-8.1v9.2h8.1v24.1c0,5.4,1.5,9.5,4.4,12.3,2.9,2.8,7.1,4.2,12.5,4.2s4-.3,6-.8c2-.6,3.6-1.4,5.1-2.5l-3.3-8.2Z"/></g>
            <g><path className="nv" d="M454,424.4c-1.3,0-4.4-.5-9.2-1.5-.4,0-.8-.2-1.2-.3-17-4.2-29.7-26.5-34.3-35.7-.6-1.3-1.2-2.6-1.9-4l-31.9-67.8c-1.5.4-3,.6-4.5.6s-.4,0-.6,0l-13.7,16.6c.2,1.1.3,2.2.3,3.3,0,6-2.9,11.3-7.3,14.7l22.6,49.8c6.6,28,3,34.2,3,34.2h12.9c4.2,0,8.8,0,13.7,0,10.5,0,19.5.2,27.1.6,7.6.4,16.1.9,25.7,1.5.3-.6.6-2.3.8-5.3.2-3-.3-5.1-1.7-6.6Z"/><path className="nv" d="M233.9,338.5l53.8-124.8,47.1,103.6c1.2-.2,2.4-.4,3.7-.4s.9,0,1.3,0l13.1-15.9c-.3-1.3-.4-2.6-.4-4,0-6.1,3-11.6,7.6-15l-56.1-119.1h-13.7l-103.4,220.5,38.9-30.6c.3-6,3.4-11.2,8-14.4Z"/><path className="nv" d="M349.2,330.7l18.4-22.4c1.1.3,2.2.5,3.4.5,6.5,0,11.8-5.3,11.8-11.8s-.5-3.9-1.4-5.5l43-52.2c9.2,7.9,17.7,15.4,17.7,15.4l6.8-45.2,1.1-7.4-10.4,4.1-37,14.8c.4,0,7.1,5.6,14.8,12.3l-43.1,52.5c-1-.3-2.1-.5-3.2-.5-6.5,0-11.8,5.3-11.8,11.8s.5,3.7,1.3,5.4l-18.1,22c-1.2-.4-2.6-.7-4-.7-6.5,0-11.8,5.3-11.8,11.8s.8,4.7,2.1,6.6l-27.8,40.1c-1.3-.5-2.6-.7-4-.7-2.5,0-4.9.8-6.8,2.2l-34.5-26.4c.3-1.1.5-2.2.5-3.4,0-6.5-5.3-11.8-11.8-11.8s-11.8,5.3-11.8,11.8,0,1.5.2,2.2l-9.8,7.7-44.6,35.1c-12.6,19.2-25.4,24.6-33.1,26-4.4.8-7,.3-7,.3l.3,5,.3,5.3c3-.2,5.8-.3,8.5-.5,1.1,0,2.2-.1,3.3-.2,2.6-.1,5.4-.3,8.4-.4,5.6-.2,11.8-.3,18.7-.3s9.5,0,13.7.1h0s12.8-.1,12.8-.1c0,0-3.6-6.2,3-34.2l2.3-5.4,5.6-13.1,22.6-17.8c1.8,1.2,4,1.9,6.4,1.9s3.7-.5,5.3-1.3l35.7,27.3c0,.5-.1,1.1-.1,1.7,0,6.5,5.3,11.8,11.8,11.8s11.8-5.3,11.8-11.8-.3-3.2-1-4.7l28.8-41.5c.6.1,1.3.2,1.9.2,6.5,0,11.8-5.3,11.8-11.8s-.4-3.3-1-4.8Z"/><path className="nv" d="M305.6,334.8s-6.2,3.9-6.3,5.1l-3,26,19.2-17.4s-4.3-7.5-2-20c2.3-12.4-4-23.2-4-23.2,0,0-7-5.3-10.9-6.8l-4.3,12.2s-.3-13.7,5.9-31.5c0,0-8.9-5-10.4-7,0,0-6.3,5.5-10.5,7.4l5.6,18.6s-21,1.3-18.1,29.9c0,0,.9,16.6-2.4,20.1,0,0,8.8,9.4,18.5,17.2l-3-27.2s-7.8-4.6-8-6.3-.1-6.7-.1-6.7l14.6,6.8s2,6.2-.4,10.5c0,0,1.4,3.1,4.3,5.5,0,0,3.3-2.3,4.1-5.8,0,0-1.9-4.1-1-10.3l15.7-7.2s-.6,9.8-3.4,10Z"/></g>
          </svg>
        </div>
        <div className="al-hero-badge"><span className="al-hero-badge-dot"></span>5 días gratis · Sin tarjeta · Para toda América</div>
        <h1 className="al-hero-title">De QA Manual<br/>a <span>QA Automation</span><br/>sin miedo</h1>
        <p className="al-hero-sub">Playwright ejecuta. La IA te asiste. Tú mantienes el control.<br/>Tu primer spec en menos de 3 minutos.</p>
        <p className="al-hero-sub2">En español · Em português · In English</p>
        <div className="al-hero-cta">
          <a href="/register" className="al-btn al-btn-primary al-btn-xl">Comenzar prueba gratuita →</a>
          <a href="#planes" className="al-btn al-btn-ghost al-btn-lg" style={{border:'1px solid var(--al-border2)'}}>Ver planes</a>
        </div>
        <p className="al-hero-note"><strong>✓</strong> 5 días gratis &nbsp;·&nbsp; <strong>✓</strong> Sin configuración &nbsp;·&nbsp; <strong>✓</strong> Cancela cuando quieras</p>
        <div className="al-stats-bar">
          <div className="al-stat"><div className="al-stat-val">9</div><div className="al-stat-label">Módulos</div></div>
          <div className="al-stat"><div className="al-stat-val">3</div><div className="al-stat-label">Idiomas</div></div>
          <div className="al-stat"><div className="al-stat-val">20+</div><div className="al-stat-label">Dispositivos</div></div>
          <div className="al-stat"><div className="al-stat-val">5×</div><div className="al-stat-label">Más barato</div></div>
        </div>
      </section>

      {/* MISIÓN */}
      <section className="al-section al-section-dark">
        <div className="al-section-inner">
          <div className="al-mission-grid">
            <div className="al-reveal">
              <span className="al-section-tag">Filosofía</span>
              <h2 className="al-section-title">La IA es el asistente.<br/><span style={{color:'var(--al-violet3)'}}>Tú eres el QA.</span></h2>
              <p className="al-section-desc" style={{marginBottom:'1.375rem'}}>Playwright ejecuta tus pruebas — determinista, predecible, auditado por Microsoft. La IA te ayuda a escribirlas más rápido. Sin magia negra. Sin sorpresas.</p>
              <p className="al-section-desc">Pensado para el QA manual que siempre quiso automatizar pero le daba miedo dar el salto. Achilltest lo hace contigo — no por ti.</p>
            </div>
            <div className="al-reveal al-mission-code">
              <div className="al-code-bar">
                <div className="al-code-dot" style={{background:'#ff5f57'}}></div>
                <div className="al-code-dot" style={{background:'#febc2e'}}></div>
                <div className="al-code-dot" style={{background:'#28c840'}}></div>
                <span className="al-code-title">login_flow.spec.ts — Achilltest</span>
              </div>
              <div className="al-code-body">
                <div className="al-code-line"><span className="al-ln">1</span><span className="al-cm">// Generado desde instrucciones en español</span></div>
                <div className="al-code-line"><span className="al-ln">2</span><span className="al-cm">// Ejecutado por Playwright — 100% determinista</span></div>
                <div className="al-code-line"><span className="al-ln">3</span></div>
                <div className="al-code-line"><span className="al-ln">4</span><span className="al-kw">import</span> {'{'}<span className="al-fn"> test</span>, <span className="al-fn">expect</span> {'}'} <span className="al-kw">from</span> <span className="al-str">'@playwright/test'</span></div>
                <div className="al-code-line"><span className="al-ln">5</span></div>
                <div className="al-code-line"><span className="al-ln">6</span><span className="al-fn">test</span>(<span className="al-str">'Login válido'</span>, <span className="al-kw">async</span> ({'{'} <span className="al-pl">page</span> {'}'}) =&gt; {'{'}</div>
                <div className="al-code-line"><span className="al-ln">7</span>&nbsp;&nbsp;<span className="al-kw">await</span> <span className="al-pl">page</span>.<span className="al-fn">goto</span>(<span className="al-str">'/login'</span>)</div>
                <div className="al-code-line"><span className="al-ln">8</span>&nbsp;&nbsp;<span className="al-kw">await</span> <span className="al-pl">page</span>.<span className="al-fn">locator</span>(<span className="al-str">'#email'</span>).<span className="al-fn">fill</span>(<span className="al-str">'usuario@empresa.com'</span>)</div>
                <div className="al-code-line"><span className="al-ln">9</span>&nbsp;&nbsp;<span className="al-kw">await</span> <span className="al-pl">page</span>.<span className="al-fn">locator</span>(<span className="al-str">'#password'</span>).<span className="al-fn">fill</span>(<span className="al-str">'••••••••'</span>)</div>
                <div className="al-code-line"><span className="al-ln">10</span>&nbsp;&nbsp;<span className="al-kw">await</span> <span className="al-pl">page</span>.<span className="al-fn">getByRole</span>(<span className="al-str">'button'</span>).<span className="al-fn">click</span>()</div>
                <div className="al-code-line"><span className="al-ln">11</span>&nbsp;&nbsp;<span className="al-kw">await</span> <span className="al-fn">expect</span>(<span className="al-pl">page</span>).<span className="al-fn">toHaveURL</span>(<span className="al-str">'/dashboard'</span>)</div>
                <div className="al-code-line"><span className="al-ln">12</span>{'})'}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FUNCIONES */}
      <section className="al-section" id="funciones">
        <div className="al-section-inner">
          <div style={{maxWidth:'540px',marginBottom:'3rem'}} className="al-reveal">
            <span className="al-section-tag">Funciones</span>
            <h2 className="al-section-title">Todo lo que tu equipo necesita</h2>
            <p className="al-section-desc">Nueve módulos integrados. En español, inglés y portugués. Sin herramientas extra.</p>
          </div>
          <div className="al-features-grid al-reveal">
            <Feature icon="🎯" name="E2E Testing con IA" desc="Describe el flujo en español. Achilltest genera el spec de Playwright y lo ejecuta en tiempo real." tag="Todos los planes" tagBg="rgba(124,92,191,.12)" tagColor="var(--al-violet3)"/>
            <Feature icon="🎥" name="Grabación de flujos" desc="Navega el sitio dentro del sistema. Cada click se graba. La IA limpia las acciones duplicadas." tag="Starter+" tagBg="rgba(38,181,170,.1)" tagColor="var(--al-teal)"/>
            <Feature icon="🔌" name="API Testing" desc="Importa Postman u OpenAPI con contratos. Detecta flujos, dependencias y encriptación automáticamente." tag="Teammate" tagBg="rgba(34,197,94,.1)" tagColor="var(--al-green)"/>
            <Feature icon="♿" name="Accesibilidad WCAG" desc="Analiza cualquier URL con axe-core. Detecta violaciones WCAG 2.0 con el selector exacto del fallo." tag="Teammate" tagBg="rgba(34,197,94,.1)" tagColor="var(--al-green)"/>
            <Feature icon="📊" name="Reportes Allure" desc="Reporte HTML interactivo con gráficas, tendencias y screenshots. Descarga en ZIP. Estándar de la industria." tag="Teammate" tagBg="rgba(34,197,94,.1)" tagColor="var(--al-green)"/>
            <Feature icon="🔗" name="Jira + Zephyr Scale" desc="Cuando un test falla, crea el bug en Jira automáticamente con screenshot y log de error." tag="Teammate" tagBg="rgba(34,197,94,.1)" tagColor="var(--al-green)"/>
            <Feature icon="📦" name="Versionado en GitHub" desc="Cada spec se versiona en tu repo con commit descriptivo. Incluye config y workflow CI/CD." tag="Todos los planes" tagBg="rgba(124,92,191,.12)" tagColor="var(--al-violet3)"/>
            <Feature icon="🏢" name="Equipos y roles" desc="Manager, QA Lead y QA Engineer. Proyectos asignados, dashboard de métricas y fallos recurrentes." tag="Teammate" tagBg="rgba(34,197,94,.1)" tagColor="var(--al-green)"/>
            <Feature icon="🤖" name="Reparación con IA" desc="Si un spec falla, la IA repara automáticamente el selector usando el DOM real en el momento del fallo." tag="Todos los planes" tagBg="rgba(124,92,191,.12)" tagColor="var(--al-violet3)"/>
          </div>
        </div>
      </section>

      {/* PLANES */}
      <section className="al-section al-section-dark" id="planes">
        <div className="al-section-inner">
          <div style={{textAlign:'center',maxWidth:'520px',margin:'0 auto 3rem'}} className="al-reveal">
            <span className="al-section-tag">Planes de lanzamiento</span>
            <h2 className="al-section-title">Simple y transparente</h2>
            <p className="al-section-desc" style={{margin:'0 auto'}}>Sin contratos. Sin sorpresas. Cancela cuando quieras. Precios en USD.</p>
          </div>
          <div className="al-pricing-grid al-reveal">
            <div className="al-plan">
              <div className="al-plan-name">Starter</div>
              <div className="al-plan-desc">Para QA Engineers individuales</div>
              <div className="al-plan-price"><sup>$</sup>78<sub>.99/mes</sub></div>
              <div className="al-plan-limit">1 usuario · 60 ejecuciones E2E/mes · 1 proyecto</div>
              <ul className="al-plan-features">
                <li><span className="al-check">✓</span> E2E Testing con IA en español</li>
                <li><span className="al-check">✓</span> Grabación de flujos en iframe</li>
                <li><span className="al-check">✓</span> Reparación IA de specs fallidos</li>
                <li><span className="al-check">✓</span> Dispositivos Desktop</li>
                <li><span className="al-check">✓</span> Versionado automático en GitHub</li>
                <li><span className="al-check">✓</span> Reportes HTML</li>
                <li><span className="al-check">✓</span> Historial 30 días</li>
                <li><span className="al-cross">✗</span> API Testing</li>
                <li><span className="al-cross">✗</span> Reportes Allure</li>
                <li><span className="al-cross">✗</span> Jira + Zephyr</li>
              </ul>
              <a href="/register?plan=starter" className="al-plan-btn al-plan-btn-outline">Empezar con Starter</a>
              <p className="al-plan-trial"><strong>5 días gratis</strong> · Sin tarjeta de crédito</p>
            </div>
            <div className="al-plan al-featured">
              <div className="al-plan-badge">Más popular</div>
              <div className="al-plan-name">Teammate</div>
              <div className="al-plan-desc">Para equipos pequeños de QA</div>
              <div className="al-plan-price"><sup>$</sup>128<sub>.99/mes</sub></div>
              <div className="al-plan-limit">3 usuarios · 100 ejecuciones E2E/mes · 3 proyectos</div>
              <ul className="al-plan-features">
                <li><span className="al-check">✓</span> Todo lo de Starter</li>
                <li><span className="al-check">✓</span> Hasta 3 usuarios en el equipo</li>
                <li><span className="al-check">✓</span> API Testing (Postman + OpenAPI)</li>
                <li><span className="al-check">✓</span> Accesibilidad WCAG 2.0</li>
                <li><span className="al-check-teal">✓</span> <strong style={{color:'var(--al-teal)'}}>Reportes Allure descargables</strong></li>
                <li><span className="al-check">✓</span> Jira + Zephyr Scale integrados</li>
                <li><span className="al-check">✓</span> Organizaciones y roles</li>
                <li><span className="al-check">✓</span> CI/CD con GitHub Actions</li>
                <li><span className="al-check">✓</span> Historial 90 días · 3 proyectos</li>
              </ul>
              <a href="/register?plan=teammate" className="al-plan-btn al-plan-btn-primary">Empezar con Teammate</a>
              <p className="al-plan-trial"><strong>5 días gratis</strong> · Sin tarjeta de crédito</p>
            </div>
          </div>
          <div className="al-coming-soon al-reveal">
            <div className="al-coming-pill">
              <span className="al-coming-label">Próximamente:</span>
              <span className="al-coming-plans">Advance · Pro · Enterprise</span>
              <span className="al-coming-tag">Mes 3+</span>
            </div>
            <p style={{marginTop:'.875rem',fontSize:'.8125rem',color:'var(--al-text2)'}}>Mobile Testing · Migración de frameworks · Unit Tests · Performance Testing</p>
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section className="al-section">
        <div className="al-section-inner">
          <div style={{textAlign:'center',maxWidth:'500px',margin:'0 auto 2.5rem'}} className="al-reveal">
            <span className="al-section-tag">Comparativa</span>
            <h2 className="al-section-title">¿Por qué Achilltest?</h2>
            <p className="al-section-desc" style={{margin:'0 auto'}}>Lo que cuesta el stack equivalente por separado vs. Achilltest Teammate.</p>
          </div>
          <div className="al-compare-wrap al-reveal">
            <div className="al-compare-scroll">
              <table className="al-compare">
                <thead>
                  <tr>
                    <th style={{textAlign:'left',color:'var(--al-text2)'}}>Herramienta</th>
                    <th style={{color:'var(--al-text2)'}}>Competidores</th>
                    <th className="al-hl" style={{color:'var(--al-violet3)'}}>Achilltest Teammate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>E2E Testing con IA</td><td>Momentic / Mabl<br/><span style={{color:'var(--al-amber)',fontSize:'.8125rem'}}>$600–800/mes</span></td><td className="al-hl al-yes">✓ Incluido</td></tr>
                  <tr><td>API Testing</td><td>Postman Enterprise<br/><span style={{color:'var(--al-amber)',fontSize:'.8125rem'}}>$49/usuario/mes</span></td><td className="al-hl al-yes">✓ Incluido</td></tr>
                  <tr><td>Accesibilidad WCAG</td><td>Axe DevTools<br/><span style={{color:'var(--al-amber)',fontSize:'.8125rem'}}>$1,250/mes</span></td><td className="al-hl al-yes">✓ Incluido</td></tr>
                  <tr><td>Reportes Allure</td><td>Allure TestOps<br/><span style={{color:'var(--al-amber)',fontSize:'.8125rem'}}>$25/usuario/mes</span></td><td className="al-hl al-yes">✓ Incluido</td></tr>
                  <tr><td>Jira + Zephyr Scale</td><td>Zephyr Scale<br/><span style={{color:'var(--al-amber)',fontSize:'.8125rem'}}>$10/usuario/mes</span></td><td className="al-hl al-yes">✓ Integrado</td></tr>
                  <tr style={{borderTop:'1px solid var(--al-border2)'}}><td style={{fontWeight:600,color:'var(--al-white)'}}>Total estimado</td><td style={{color:'#f87171',fontWeight:700,fontSize:'1rem'}}>$2,500–3,000/mes</td><td className="al-hl al-big">$128.99/mes</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* AMERICA */}
      <section className="al-section al-section-dark" id="america">
        <div className="al-section-inner" style={{textAlign:'center'}}>
          <div className="al-america-flags al-reveal">🇲🇽 🇧🇷 🇨🇴 🇦🇷 🇨🇱 🇵🇪 🇺🇸 🇨🇦 🇻🇪 🇪🇨</div>
          <span className="al-section-tag al-reveal">Cobertura</span>
          <h2 className="al-section-title al-reveal">Hecho para toda América</h2>
          <p className="al-section-desc al-reveal" style={{margin:'0 auto 2.5rem'}}>Desde Alaska hasta Patagonia. Soporte en tu idioma y zona horaria.</p>
          <div className="al-america-langs al-reveal">
            <div className="al-lang-card"><div className="al-lang-flag">🇲🇽</div><div className="al-lang-name">Español</div><div className="al-lang-desc">México · Colombia · Argentina y toda LATAM</div></div>
            <div className="al-lang-card"><div className="al-lang-flag">🇧🇷</div><div className="al-lang-name">Português</div><div className="al-lang-desc">Brasil — mayor mercado tech de LATAM</div></div>
            <div className="al-lang-card"><div className="al-lang-flag">🇺🇸</div><div className="al-lang-name">English</div><div className="al-lang-desc">USA · Canada · Caribbean</div></div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="al-cta-section">
        <div className="al-cta-glow"></div>
        <div className="al-section-inner" style={{position:'relative'}}>
          <span className="al-section-tag al-reveal" style={{display:'block',textAlign:'center',marginBottom:'.875rem'}}>Empieza hoy</span>
          <h2 className="al-cta-title al-reveal">Tu equipo merece<br/><span style={{background:'linear-gradient(135deg,var(--al-violet3),var(--al-teal))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>mejores herramientas</span></h2>
          <p className="al-cta-sub al-reveal">5 días gratis. Sin tarjeta de crédito. Tu primer spec automatizado en menos de 3 minutos.</p>
          <div className="al-cta-actions al-reveal">
            <a href="/register" className="al-btn al-btn-primary al-btn-xl">Comenzar prueba gratuita →</a>
            <a href="mailto:hola@achilltest.io" className="al-btn al-btn-ghost al-btn-lg" style={{border:'1px solid var(--al-border2)'}}>Hablar con ventas</a>
          </div>
          <div className="al-cta-guarantees al-reveal">
            <span className="al-guarantee"><strong>✓</strong> Sin tarjeta</span>
            <span className="al-guarantee"><strong>✓</strong> Cancela cuando quieras</span>
            <span className="al-guarantee"><strong>✓</strong> Soporte en tu idioma</span>
            <span className="al-guarantee"><strong>✓</strong> Datos en América</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="al-footer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" style={{height:'20px',width:'auto',opacity:.55}}>
          <defs><style>{`.nfoot{fill:#fff}`}</style></defs>
          <g><path className="nfoot" d="M284.2,320.5l-15.1,33.6h6.4l3.3-7.8h16.8l3.3,7.8h6.6l-15.1-33.6h-6.1ZM280.9,341.4l6.3-14.7,6.3,14.7h-12.6Z"/><rect className="nfoot" x="383.2" y="318.5" width="5.9" height="35.6"/><rect className="nfoot" x="397.1" y="318.5" width="5.9" height="35.6"/></g>
          <g><path className="nfoot" d="M233.9,338.5l53.8-124.8,47.1,103.6c1.2-.2,2.4-.4,3.7-.4s.9,0,1.3,0l13.1-15.9c-.3-1.3-.4-2.6-.4-4,0-6.1,3-11.6,7.6-15l-56.1-119.1h-13.7l-103.4,220.5,38.9-30.6c.3-6,3.4-11.2,8-14.4Z"/></g>
        </svg>
        <p className="al-footer-copy">© 2025 Achilltest. Todos los derechos reservados.</p>
        <nav className="al-footer-links">
          <a href="#planes">Planes</a>
          <a href="/docs">Docs</a>
          <a href="mailto:hola@achilltest.io">Contacto</a>
          <a href="/privacy">Privacidad</a>
        </nav>
      </footer>
    </>
  )
}

function Feature({ icon, name, desc, tag, tagBg, tagColor }: any) {
  return (
    <div className="al-feature">
      <div className="al-feature-ico">{icon}</div>
      <div className="al-feature-name">{name}</div>
      <div className="al-feature-desc">{desc}</div>
      <span className="al-tag" style={{background:tagBg,color:tagColor}}>{tag}</span>
    </div>
  )
}
