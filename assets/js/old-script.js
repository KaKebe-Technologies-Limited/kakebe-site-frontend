{
  const API_BASE_URL = 'http://localhost:1337';

  // This function determines the appropriate image size key ('small', 'medium', or 'large')
  // based on the current window width.
  function setImageSize(){
    let sizeKey;
    const width = window.innerWidth;
    if (width<=600) {
      sizeKey = "small";
    } else if (width<=1200) {
      sizeKey = "medium";
    } else {
      sizeKey = "large";
    }
    return sizeKey;
  }

  function parseField(field) {
    function parseChildren(child) {
      for (let el in child) {
        if (el == 'type') {

        }
      }
    }    
  }
  
  document.addEventListener('DOMContentLoaded', populateContent);

  function populateContent() {
    //populateHomePage();
    //populateAboutPage();
    populateCompanyProfile();
    populateTeamMembers();
    populateProducts();
    populateServices();
  }

  /* 
  function populateHomePage() {
      fetch(`${API_BASE_URL}/api/home?populate=*`)
      .then(response => response.json())
      .then(data => {
          const content = data.data;
          const container = document.getElementById('hero');
          const hero = content.hero;

          hero.forEach(element => {
          const type = element.type;
          switch (type) {
              case 'heading':
              const level = element.level;
              const head = document.createElement('div');
              head.innerHTML = `<h${level} class="display-2"><b class="d-none">${element.children[0].text}</b></h${level}>`;

              if (head) {
                  container.appendChild(head);
              }
              break;

              case 'paragraph':
              const par = document.createElement('p');
              par.innerHTML = `<p class="display-5">${element.children[0].text}</p>`;
              if (par) {
                  container.appendChild(par);
              }
              break;
          }
          });
      })
      .catch(err => console.error('Error fetching data: ', err));
  } 
*/
/* 
  function populateAboutPage() {
    fetch(`${API_BASE_URL}/api/company-profile?populate=*`)
      .then(res => res.json())
      .then(data => {
        const info = data.data;
        const imageUrl = info.image.data?.url ? `${API_BASE_URL}${info.image.data?.url}` : '../assets/img/6.JPG';

        document.getElementById("about-title").textContent = parseField(info.title);
        document.getElementById("about-text").innerHTML = parseField(info.info_text);
        document.getElementById("mission").innerHTML = parseField(info.mission);
        document.getElementById("vision").innerHTML = parseField(info.vision);
        document.getElementById("values").innerHTML = parseField(info.values);
        document.getElementById("about-image").src = imageUrl;

        // Optional contact info
        document.getElementById("about-contact").innerHTML = `
          <p><strong>Email:</strong> ${info.contact_email}</p>
          <p><strong>Phone:</strong> ${info.phone_number}</p>
          <p><strong>Location:</strong> ${info.location}</p>
        `;
      })
      .catch(err => console.error("Error fetching company profile:", err));
  } */

  function populateCompanyProfile() {
    fetch(`${API_BASE_URL}/api/company-profile?populate=*`)
    .then(res => res.json())
    .then(data => {
      const info = data.data;
      const imageUrl = info.image ? `${API_BASE_URL}${info.image.data?.url}` : 'assets/img/6.JPG';
      document.getElementById("about-title").textContent = `${info.title}`;
      console.log(typeof(info.intro_text[0].children));
      document.getElementById("about-text").innerHTML = parseField(info.info_text);
      document.getElementById("mission").innerHTML = parseField(info.mission);
      document.getElementById("vision").innerHTML = parseField(info.vision);
      document.getElementById("values").innerHTML = parseField(info.values);
      document.getElementById("about-image").setAttribute('src', imageUrl);

      // Optional contact info
      document.getElementById("about-contact").innerHTML = `
        <p><strong>Email:</strong> ${info.contact_email}</p>
        <p><strong>Phone:</strong> ${info.landline}</p>
        <p><strong>WhatsApp:</strong> ${info.phone_number}</p>
        <p><strong>Location:</strong> ${info.location}</p>
      `;
    });  
  }

  function populateTeamMembers() {
    fetch(`${API_BASE_URL}/api/team-members?populate=*`)
      .then(response => response.json())
      .then(data => {
        const teamMembers = data.data;
        const container = document.getElementById('team-container');

        // Group team members by department
        const groups = {};
        teamMembers.forEach(member => {
          const dept = member.department || "General";
          if (!groups[dept]) groups[dept] = [];
          groups[dept].push(member);
        });

        // Create collapsible sections
        for (const [department, members] of Object.entries(groups)) {
          const section = document.createElement('div');
          section.classList.add('department-section', 'mb-5');

          // Accordion header
          const header = document.createElement('div');
          header.classList.add('department-header', 'd-flex', 'justify-content-between', 'align-items-center', 'p-3', 'bg-light');
          header.innerHTML = `
            <h3 class="mb-0"><strong>${department}</strong></h3>
            <button class="toggle-btn btn btn-sm btn-outline-primary" type="button">Show</button>
          `;
          section.appendChild(header);

          // Members container (hidden by default)
          const membersContainer = document.createElement('div');
          membersContainer.classList.add('department-members', 'row', 'mt-3');
          membersContainer.style.display = 'none';

          members.forEach(member => {
            const desc = member.description?.[0]?.children?.[0]?.text || "No description available.";
            let avatarUrl = "assets/img/default-avatar.jpg";
            let imageSize = setImageSize();
            if (member.avatar && member.avatar.formats && member.avatar.formats[imageSize]) {
              avatarUrl = `${API_BASE_URL}${member.avatar.formats[imageSize].url}`;
            }

            const card = document.createElement('div');
            card.classList.add('team-member-card', 'col-md-6', 'col-lg-3', 'mb-4', 'd-flex');
            card.innerHTML = `
              <div class="team-box p-3" data-aos="fade-up" data-aos-duration="700">
                <div class="image-area mb-3 text-center">
                  <div class="image image-anime">
                    <img src="${avatarUrl}" alt="${member.name}" class="avatar img-fluid rounded-circle">
                  </div>
                </div>
                <div class="text-start">
                  <h4 class="mb-1">${member.name}</h4>
                  <p class="position text-muted mb-2">${member.position || "Unknown Position"}</p>
                </div>
                <div class="button team-btn aos-init aos-animate" data-aos="fade-up-left" data-aos-duration="800">
                  <a class="theme-btn2" href="team.html?${member.name}">
                    Learn More
                    <span class="arrow1"><i class="fa-solid fa-arrow-right"></i></span>
                    <span class="arrow2"><i class="fa-solid fa-arrow-right"></i></span>
                  </a>
                </div>
              </div>
            `;
            membersContainer.appendChild(card);
          });

          section.appendChild(membersContainer);
          container.appendChild(section);

          // Toggle functionality
          const toggleBtn = header.querySelector('.toggle-btn');
          toggleBtn.addEventListener('click', () => {
            const isVisible = membersContainer.style.display === 'flex' || membersContainer.style.display === 'block';
            membersContainer.style.display = isVisible ? 'none' : 'flex';
            toggleBtn.textContent = isVisible ? 'Show' : 'Hide';
          });
        }
      })
      .catch(err => console.error('Error fetching team members:', err));
  }

  function populateProducts() {
    fetch(`${API_BASE_URL}/api/products?populate=*`)
      .then(response => response.json())
      .then(data => {
        const products = data.data;
        const container = document.getElementById('product-container');

        products.forEach(product => {
          const info = product;
          let imageUrl = 'assets/img/logo.png'; // fallback image

          // check image path
          if (info.image && info.image.url) {
            imageUrl = `${API_BASE_URL}${info.image.url}`;
          }

          const prod = document.createElement('div');
          prod.classList.add('col-md-4');
          prod.setAttribute('data-aos', 'fade-up');
          prod.setAttribute('data-aos-duration', '900');

          prod.innerHTML = `
            <div class="item-box">
              <div class="product">
                <div class="d-flex align-items-center">
                  <div class="icon">
                    <img src="${imageUrl}" alt="${info.image?.alternativeText || ''}" />
                  </div>
                  <h3><a href="${info.weblink || '#'}" target="_blank" rel="noreferrer">${info.name}</a></h3>
                </div>
                <div class="space10"></div>
                <p>${info.description?.[0]?.children?.[0]?.text || 'No description available.'}</p>
              </div>
            </div>
          `;

          container.appendChild(prod);
        });
      })
      .catch(err => console.error('Error fetching products: ', err));
  }

  function populateServices() {
    fetch(`${API_BASE_URL}/api/services?populate=*`)
    .then(response => response.json())
    .then(data => {
      const services = data.data;
      const container = document.getElementById('services-container');

      services.forEach(service => {
        const serve = document.createElement('div');
        serve.classList.add('service', 'col-md-6', 'col-lg-4');
        serve.innerHTML = `
          <div data-aos="zoom-in-up" data-aos-duration="700">
            <div class="servcie2-box">
              <div class="icon">
                <img src="${API_BASE_URL}${service.icon.url}" alt="${service.name}" />
              </div>
              <a href="#" class="arrow"
                ><i class="fa-solid fa-arrow-right"></i
              ></a>
              <div class="heading2">
                <h4><a href="#">${service.name}</a></h4>
                <div class="space16"></div>
                <p>${service.description}</p>
              </div>
            </div>
          </div>
        `;

        container.appendChild(serve);
      })
    })
    .catch(err => console.error('Error loading services: ', err))
  }
}