## Sistema Online de Pedidos para la Cafetería Universitaria

Repositorio oficial del sistema de gestión y pedidos desarrollado para la cafetería universitaria de la **Universidad Privada del Valle (Univalle)**, sede La Paz, Bolivia. Este proyecto implementa una administración profesional del desarrollo bajo metodologías ágiles (**Extreme Programming - XP**).

---

## Equipo de Desarrollo («404 equipo not found»)

* **Americo Oswaldo Ramirez Rocha** (Backend y Base de Datos - Laravel / MySQL)[cite: 2]
* **Lukas Llanos Medrano** (Frontend y Componentes de Interfaz)[cite: 2]
* **Chris Jeremy Rojas Condori** (Frontend y Desarrollo Web)[cite: 2]
* **Cristhian Giovanni Pacsi Pari** (Diseño de Interfaz / UI & UX)[cite: 2]
* **Amara Isabel Quintela Ramirez** (Diseño de Interfaz / UI & UX)[cite: 2]

---

## Estructura del Repositorio

El repositorio se encuentra organizado de forma limpia separando responsabilidades:

* `backend/` → API REST desarrollada en **Laravel 9**: controladores, modelos Eloquent, migraciones, seeders y pruebas unitarias PHPUnit.
* `frontend/` → Interfaz construida con HTML, CSS y JavaScript nativo que consume de forma desacoplada la API.
* `docs/` → Documentación formal del proyecto, incluyendo el **Manual de Usuario (PDF)** y la **Documentación Técnica (PDF)**.

---

## Características Principales y Roles del Sistema

El sistema contempla cuatro roles principales de usuario gestionados mediante autenticación institucional (`@univalle.edu` o `@est.univalle.edu`)[cite: 3]:

1. **Visitante:** Permite visualizar el menú digital, realizar búsquedas de productos y armar un pedido de forma rápida sin necesidad de iniciar sesión[cite: 3].
2. **Cliente:** Permite confirmar pedidos en línea utilizando un correo institucional, generando un código de verificación único de 6 caracteres para evitar filas y asegurar la entrega[cite: 3].
3. **Empleado (Cocina):** Panel especializado de tres columnas (*Pendientes*, *En preparación* y *Listos*) para gestionar el flujo de pedidos en tiempo real y validar la entrega mediante código[cite: 3].
4. **Administrador:** Gestión integral de productos, precios, stock, personal y control de roles dentro de la plataforma[cite: 3].

---

## Tecnologías Utilizadas

* **Backend:** PHP, Laravel 9[cite: 3].
* **Base de Datos:** MySQL / XAMPP[cite: 3].
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla)[cite: 3].
* **Gestión de Proyecto y Control de Versiones:** Jira (Tableros ágiles e Historias de Usuario)[cite: 3], Git / GitHub (Flujo basado en Conventional Commits y Pull Requests)[cite: 3].

---

## Puesta en Marcha (Instalación Local)

Sigue estos pasos para levantar el entorno de desarrollo localmente:

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/Cafeteria-Organization/cafeteria-pedidos.git](https://github.com/Cafeteria-Organization/cafeteria-pedidos.git)
